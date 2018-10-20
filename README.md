# NilScript

NilScript is a superset of the JavaScript language inspired by the latest versions of Objective-C.  It features a fast, simple runtime without a dynamic messaging overhead. 

NilScript is designed to ease the pain of syncing class interfaces (not necessarily implementations) between Objective-C projects and their web counterparts.

In our case, we use it to sync [Tenuto](http://www.musictheory.net/buy/tenuto) with the [musictheory.net exercises](http://www.musictheory.net/exercises), and [Theory Lessons](http://musictheory.net/buy/lessons) with the [musictheory.net lessons](http://www.musictheory.net/lessons).

### Installation

    npm install nilscript

### Main Features

- [Classes](#class)
  - [Basic Syntax](#class-syntax)
  - [Behind the Scenes](#class-compiler)
- [The Built-in Base Class](#base-class)
- [Methods](#method)
  - [Falsy Messaging](#method-falsy)
  - [Behind the Scenes](#method-compiler)
- [Properties and Instance Variables](#property)
  - [Synthesis](#property-synthesis) 
  - [Using](#property-using)
  - [Property Attributes](#property-attributes) 
  - [Initialization](#property-init) 
  - [Behind the Scenes](#property-compiler)
- [Property Observers](#observers)
- [Callbacks](#callbacks)
- [Selectors](#selector)
- [Protocols](#protocols)
- [Boolean/null aliases](#aliases)
- [@enum and @const](#enum)
- [@global](#global)
- [Runtime](#runtime)
- [Restrictions](#restrictions)
- [Hinting](#hinting)
- [Type Checking](#typechecking)
- [API](#api)
- [Compiling Projects](#compiling-projects)
- [Squeezing and Symbolication](#squeeze)
- [Acknowledgements](#acknowledgements)
- [License](#license)


### Differences from Objective-J

In contrast to [Objective-J](http://en.wikipedia.org/wiki/Objective-J): 

  - NilScript always uses [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames).
   This allows the resulting JavaScript code to be optimized using Closure Compiler's ADVANCED_OPTIMIZATIONS.
  - NilScript uses the native JavaScript runtime to call methods rather than imitating the Objective-C runtime (see below).
  - NilScript focuses on being a language, not a framework.  The only requirement at runtime is the `runtime.js` file.
  - NilScript has full support of @property and the default synthesis of ivars/getters/setters.
  - NilScript includes a [built-in obfuscator](#squeeze) which hides method and class names in compiled code.

---

## <a name="class"></a>Classes

While Objective-C uses `@interface` to define a class interface and `@implementation` for its implementation, NilScript combines both into `@class` (due to the lack of header files in JavaScript).

### <a name="class-syntax"></a>Basic syntax

The syntax to create an empty NilScript class looks like this:

```
@class TheClass
@end
```

To inherit from a superclass, use a colon followed by the superclass name:

```
@class TheSubClass : TheSuperClass 
@end
```

Additional [instance variables](#ivar) can be added by using a block after class name (or superclass name):

```
@class TheClass {
    String _myStringInstanceVariable;    
}
@end

@class TheSubClass : TheSuperClass {
    String _myStringInstanceVariable;    
}
@end
```

### <a name="class-compiler"></a>Behind the scenes (Class)

Behind the scenes, the NilScript compiler changes the `@class`/`@end` block into a JavaScript function block which is invoked at runtime.  Private functions and variables may be declared inside of an `@class` without polluting the global namespace.

```
@class TheClass
let sPrivateStaticVariable = "Private";
function sPrivate() { }
@end
```

becomes equivalent to:

```
oj_private_function(…, function() {
    let sPrivateStaticVariable = "Private";
    function sPrivate() { }
});
```

To prevent undefined behavior, variable declarations must be initialized to a literal or function expression (or left uninitialized).  

Note: Only `@property`, `@synthesize`, `@dynamic`, `@observe`, instance variable declarations, method declarations, variable declarations, or function declarations may be used inside of an `@class` block.

---

## <a name="base-class"></a>The Built-in Base Class

Unlike Objective-C, all NilScript classes inherit from a private root base class.  There is no way to specify your own root class (how often do you *not* inherit from NSObject in your code?).

The root base class provides the following methods:

```
+ (id) alloc
+ (Class) class
+ (Class) superclass
+ (String) className
+ (BOOL) isSubclassOfClass:(Class)cls

+ (BOOL) instancesRespondToSelector:(SEL)aSelector

- (id) init
- (id) copy

- (Class) class
- (Class) superclass
- (String) className 
- (BOOL) isKindOfClass:(Class)cls
- (BOOL) isMemberOfClass:(Class)cls

- (String) description 

- (BOOL) respondsToSelector:(SEL)aSelector
- (id) performSelector:(SEL)aSelector
- (id) performSelector:(SEL)aSelector withObject:(id)object
- (id) performSelector:(SEL)aSelector withObject:(id)object withObject:(id)object2

- (BOOL) isEqual:(id)anotherObject
```

While NilScript 0.x supported `+load` and `+initialize`, this feature was removed in NilScript 1.x to optimize runtime performance.  Note: `+className` and `-className` are intended for debugging purposes only.  When `--squeeze` is passed into the compiler, class names will be obfuscated/shortened.

---
### <a name="method"></a>Methods

Methods are defined in a `@class` block and use standard Objective-C syntax:

```
@class TheClass
    
- (String) doSomethingWithString:(String)string andNumber:(Number)number
{
    return string + "-" + number;    
}

// Returns "Foo-5"
- (String) anotherMethod
{
    return [self doSomethingWithString:"Foo" andNumber:5];
}
    
@end
```

Old-school bare method declarations may also be used:

```
@class TheClass
    
- doSomethingWithString:string andNumber:number
{
    return string + "-" + number;    
}
    
@end
```

### <a name="method-falsy"></a>Falsy Messaging

Just as Objective-C supports messaging `nil`, NilScript supports the concept of "Falsy Messaging".

Any message to a falsy JavaScript value (false / undefined / null / 0 / "" / NaN ) will return that value.  

```
let foo = null;
let result = [foo doSomething];  // result is null
```

### <a name="method-compiler"></a>Behind the Scenes (Methods)

Behind the scenes, NilScript methods are simply renamed JavaScript functions.  Each colon (`:`) in a method name is replaced by an underscore and a prefix is added to the start of the method name.

Hence:

```
- (String) doSomethingWithString:(String)string andNumber:(Number)number
{
    return string + "-" + number;    
}
```

becomes the equivalent of:

```
TheClass.prototype.N$_f_doSomethingWithString_andNumber_ = function(string, number)
{
    return string + "-" + number;    
}
```

Messages to an object are simply JavaScript function calls wrapped in a falsey check.  Hence:

     let result = [anObject doSomethingWithString:"Hello" andNumber:0];
     
becomes the equivalent of:

     let result = anObject && anObject.N$_f_doSomethingWithString_andNumber_("Hello", 0);
     
The compiler will produce slightly different output depending on:

 - if the return value is needed
 - if the message receiver is a JavaScript expression.
 - if the message receiver is known to be non-falsey
 - if the message receiver is `self`
 - if the message receiver is `super`

Sometimes the compiler will choose to use `nilscript.msgSend()` rather than a direct function call.

---
## <a name="property"></a>Properties and Instance Variables

NilScript uses the Objective-C 2.0 `@property` syntax which originally appeared in Mac OS X 10.5 Leopard.  It also supports the concept of default property synthesis added in Xcode 4.4.

In addition, NilScript allows storage for additional instance variables (ivars) to be defined on a class.

A class that uses a property, private ivar, and accesses them in a method may look like this:

```
@class TheClass {
    Number _privateNumberIvar;
}
    
@property Number publicNumberProperty; // Generates publicNumberProperty ivar

- (Number) addPublicAndPrivateNumbers
{
    return _privateNumberIvar + _publicNumberIvar;
}
    
@end
```

### <a name="property-synthesis"></a>Synthesis 

Properties are defined using the `@property` keyword in an `@class` block:

```
@class TheClass
@property String myStringProperty;
@end
```

In the above example, the compiler will automatically synthesize a backing instance variable `_myStringProperty` for `myStringProperty`.  It will also create an accessor method pair: `-setMyStringProperty:` and `-myStringProperty`.

If a different backing instance variable is desired, the `@synthesize` directive is used:

```
@class TheClass
@property String myStringProperty;
    
// Maps myStringProperty property to m_myStringProperty instance variable
@synthesize myStringProperty=m_MyStringProperty;
@end
```

As in Objective-C, `@synthesize` without an `=` results in the same name being used for the backing instance variable:

```
@class TheClass
@property String myStringProperty;
    
// Maps myStringProperty property to myStringProperty instance variable
@synthesize myStringProperty;
@end
```

The `@dynamic` directive suppresses the generation of both the backing instance variable and the setter/getter pair.

```
@class TheClass
@property String myStringProperty;
@dynamic myStringProperty; // No instance variable, getter, nor setter is synthesized
@end
```

In addition, multiple properties may be specified in `@synthesize` and `@dynamic`:

```
@synthesize prop1, prop2, prop3=m_prop3;
@dynamic dynamic1,dynamic2;
```

### <a name="property-using"></a>Using

To access any instance variable, simply use its name.  No `this.` or `self.` prefix is needed:

```
- (void) logSheepCount
{
    console.log(_numberOfSheep);
}
```

### <a name="property-attributes"></a>Property Attributes

NilScript supports property attributes similar to Objective-C:

    @property (nontomic, copy, getter=myStringGetter) String myString;

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `getter=` | Changes the name of the getter/accessor
| `setter=` | Changes the name of the setter/mutator
| `copy`, `struct`  | Creates a copy (See below)
| `readonly`, `readwrite` | Default is readwrite, readonly suppresses the generation of a setter

`copy` uses `nilscript.makeCopy` in the setter.

`struct` uses `nilscript.makeCopy` in both the setter and the getter.  It is intended to assist the porting of C `struct`s, which are pass-by-value rather than pass-by-reference.

```
@property (copy) Foo foo;
@property (struct) Bar bar;
@property Baz baz;

// Synthesized methods:

- (void) setFoo:(Foo)foo { _foo = nilscript.makeCopy(foo); }
- (Foo) foo { return _foo; }

- (void) setBar:(Bar)bar { _bar = nilscript.makeCopy(bar); }
- (Bar) bar { return nilscript.makeCopy(_bar); }

- (void) setBaz:(Bar)bar { _baz = baz; }
- (Baz) baz { return _baz; }
```

Due to differences between JavaScript and Objective-C, the following attributes are not supported:

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `nonatomic`, `atomic` | Not supported since JavaScript is single-threaded
| `unsafe_unretained`, `weak`, `strong`, `retain` | Not supported since Javascript objects are garbage collected
| `nonnull`, `nullable`, `null_resettable`, `null_unspecified` | Currently not supported
| `class` | Currently not supported


### <a name="property-init"></a>Initialization

During `+alloc`, NilScript initializes all instance variables to one of the following values based on its type:

    Boolean         -> false
    Number          -> 0
    everything else -> null

This allows Number instance variables to be used in math operations  without the fear of `undefined` being converted to `NaN` by the JavaScript engine.


### <a name="property-compiler"></a>Behind the Scenes (Properties/ivars)

Unlike other parts of the NilScript runtime, properties and instance variables aren't intended to be accessed from non-NilScript JavaScript (they should be private to the subclass which defines them).  However, they may need to be accessed in the debugger.

The compiler uses a JavaScript property on the instance object with the follow name:

    N$_i_{{IVAR NAME}}


Hence, the following NilScript code:

```
@interface TheClass

@property (Number) counter;

- (void) incrementCounter
{
    _counter++;
}
    
@end
```

would compile into:

```
nilscript.makeClass(…, function(…) {
    
… // Compiler generates -setCounter: and -counter here

….incrementCounter = function() {
    this.N$_i__counter++;
}

});
```

### <a name="simple-ivars"></a>Simple Ivars

To make debugging easier, the `--simple-ivars` compiler flag may be used. This uses the exact ivar name as the JavaScript property.

Hence, the previous example would compile into:

```
nilscript.makeClass(…, function(…) {
    
… // Compiler generates -setCounter: and -counter here

….incrementCounter = function() {
    this._counter++;
}

});
```

As long as ivars are prefixed (either the default `_theIvarName` or the non-standard prefixes such as `m_theIvarName` or `mTheIvarName`), this should be safe. You may run into issues if you use this flag and also use an ivar name which conflicts with an `Object.prototype` property. Examples include: `constructor`, `hasOwnProperty`, `toString`, `valueOf`, etc.

`--simple-ivars` has no effect when the squeezer is enabled.

---
## <a name="observers"></a>Property Observers

In our internal UI frameworks, it's very common to call `-setNeedsDisplay` or `-setNeedsLayout` in response to a
property change.  For example, our Button class has a custom corner radius property:

```
@class Button : ClickableControl

…

@property Number cornerRadius;

…

- (void) setCornerRadius:(Number)cornerRadius
{
    if (_cornerRadius != cornerRadius) {
        _cornerRadius = cornerRadius;
        [self setNeedsDisplay];
    }
}

@end
```

Often, every property in these classes needs a custom setter, resulting in a lot of boilerplate code.
Property observers simplify this:

```
@property String backgroundColor;
@property Number cornerRadius;
@property String title;

@observe (change, after=setNeedsDisplay) backgroundColor, cornerRadius, title;
```

This example will call `[self setNeedsDisplay]` after the backgroundColor, colorRadius, or title changes.
`change` is a default attribute and may be omitted.

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `change`  | Default. Call the before/after methods in response to a property change (determined via `!==`)
| `set`     | Call the before/after methods whenever the setter is called.
| `before=` | The selector to invoke before a change or set.
| `after=`  | The selector to invoke after a change or set.

`before=` observer methods are passed the new value as an optional parameter.  `after=` observer methods
are passed the old value as an optional parameter.

For example:

```
@property Number foo;
@observe (change, before=_handleFooWillChange:, after=_handleFooDidChange:) foo;
@observe (set,    before=_handleFooWillSet:,    after=_handleFooDidSet:)    foo;

- (void) _handleFooWillChange:(Number)newFoo { … }
- (void) _handleFooDidChange:(Number)oldFoo  { … }
- (void) _handleFooWillSet:(Number)newFoo { … }
- (void) _handleFooDidSet:(Number)oldFoo  { … }
```

Will generate the following setter:

```
- (void) setFoo:(Number)newFoo
{
    var oldFoo = _foo;

    [self _handleFooWillSet:newFoo];

    if (oldFoo !== newFoo) {
        [self _handleFooWillChange:newFoo];
        _foo = newFoo;
        [self _handleFooDidChange:oldFoo];
    }

    [self _handleFooDidSet:oldFoo];
}
```

---
## <a name="callbacks"></a>Callbacks

Javascript frequently requires `.bind(this)` on callbacks.  For example:

```
Counter.prototype.incrementAfterDelay = function(delay) {
    setTimeout(function() {
        this.count++;
        this.updateDisplay();
    }.bind(this), delay);       // Bind needed for 'this' to work
}
```

NilScript handles the binding for you.  No additional code is needed to access ivars or `self`:

```
- (void) incrementAfterDelay:(Number)delay
{
    setTimeout(function() {
        _count++;
        [self updateDisplay];
    }, delay);
}
```

---
## <a name="selector"></a>Selectors

In order to support  [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames), 
selectors are not encoded as strings (as in Objective-C and Objective-J).  Instead, they use an object literal syntax:

    @selector(foo:bar:baz:) -> { N$_f_foo_bar_baz_: 1 }

Thus, a call such as:
    
    [object foo:7 bar:8 baz:9]
    
May (depending on optimizations) be turned into:

    nilscript.msgSend(object, { N$_f_foo_bar_baz_: 1 }, 7, 8, 9)


---
## <a name="aliases"></a>Boolean/null aliases

The NilScript compiler adds the following keywords for Boolean/null values and replaces them to their JavaScript equivalent:

    BOOL    ->  Boolean
    YES     ->  true
    NO      ->  false

    nil     ->  null
    Nil     ->  null
    NULL    ->  null
   
Hence:

    let nope = NO;
    let yep  = YES;
    let anObject = nil;
    
becomes:

    let nope = false;
    let yep  = true;
    let anObject = null;
      
---
## <a name="enum"></a>@enum and @const

NilScript supports C-style enumerations via the `@enum` keyword and constants via the `@const` keyword:

```
@enum OptionalEnumName {
    zero = 0,
    one,
    two,
    three = 3,
    four
}

@const TheConstant = "Hello World";

someFunction(zero, one, two, three, four, TheConstant);
```

The NilScript compiler inlines these values.  The above code becomes:

```
someFunction(0, 1, 2, 3, 4, "Hello World");
```

Note: Inlining causes the enum or const to be lifted to the global scope.  Inlining affects all occurrences of that identifier in all files for the current compilation.  Inlined enums/consts are persisted via `--output-state` and `--input-state`.

---
## <a name="global"></a>@global

To mimic C APIs such as CoreGraphics, NilScript has the ability to declare global functions and variables with `@global`.

```
@global function CGRectMake(x: Number, y: Number, width: Number, height: Number): void {
    return { origin: { x, y }, size: { width, height } };
}
    
@global CGRectZero = CGRectMake(0, 0, 0, 0);
@global CGRectNull = CGRectMake(Infinity, Infinity, 0, 0);
```

Which transforms into the equivalent of:

```
nilscript._g.CGRectMake = function(x, y, width, height) {
    return { origin: { x, y }, size: { width, height } };
}
    
nilscript._g.CGRectZero = nilscript._g.CGRectMake(0, 0, 0, 0);
nilscript._g.CGRectNull = nilscript._g.CGRectMake(Infinity, Infinity, 0, 0);
```

Unlike inlined enums and consts, globals are assigned at runtime.  Hence, in the above code example, care must be given that `CGRectMake()` isn't used for initializing `CGRectZero` until after the `@global function CGRectMake` line.  This limitation should not affect globals used from within NilScript methods (as the global will already be declared by that time).

---
## <a name="protocols"></a>Protocols

Like Objective-C, NilScript includes support for protocols.  Both `@required` and `@optional` methods may be specified:

```
@protocol ControllerDelegate
@required
- (void) controller:(Controller)controller didPerformAction:(String)action;
@optional
- (BOOL) controller:(Controller)controller shouldPerformAction:(String)action;
@end

@class Controller
@property id<ControllerDelegate> delegate
…
@end

@class TheClass <ControllerDelegate, TabBarDelegate>
- (void) controller:(Controller)controller didPerformAction:(String)action { … }
…
@end
```

Unlike Objective-C, there is no `NSObject` protocol.  Instead, all protocols extend a built-in base protocol, which has identical methods to the [built-in base class](#base-class).
    
Protocol conformance is enforced by the [typechecker](#typechecker).

---
## <a name="runtime"></a>Runtime

**nilscript.noConflict()**  
Restores the `nilscript` global variable to its previous value.


**nilscript.getClassList()**  
Returns an array of all known NilScript Class objects.


**nilscript.class_getSuperclass(cls) / nilscript.getSuperclass(cls)**  
Returns the superclass of the specified `cls`.

**nilscript.getSubclassesOfClass(cls)**  
Returns an array of all subclasses of the specified `cls`.

**nilscript.isObject(object)**  
Returns true if `object` is an NilScript instance or Class, false otherwise.

**nilscript.sel_isEqual(aSelector, bSelector)**  
Returns true if two selectors are equal to each other.

**nilscript.class_isSubclassOf(cls, superclass)**  
Returns true if `superclass` is the direct superclass of `cls`, false otherwise.

**nilscript.class_respondsToSelector(cls, aSelector)**  
Returns true if instances of `cls` respond to the selector `aSelector`, false otherwise.

**nilscript.object_getClass(object)**  
Returns the Class of `object`.

**nilscript.msgSend(receiver, aSelector, ...)**  
If `receiver` is non-falsy, invokes `aSelector` on it.

**nilscript.sel_getName(aSelector)**  
**nilscript.class_getName(cls)**  
**-[BaseObject className]**  
Returns a human-readable string of a class or selector.  Note that this is for debug purposes only!  When `--squeeze` is passed into the compiler, the resulting class/selector names will be obfuscated/shortened.

**nilscript.makeCopy(object)**  
If `object` is an NilScript instance, invokes `-copy`.  If `object` is a JavaScript array, returns a shallow clone (via `slice(0)`).  If `object` is a JavaScript primitive, returns `object`.  Else, returns a clone of each key/value pair (via `Object.keys`) on `object`.

---
## <a name="hinting"></a>Hinting

NilScript provides basic code hinting to catch common errors.

When the `--warn-unknown-selectors` option is specified, NilScript warns about usage of undefined selectors/methods.  This can help catch typos at compile time:

    let c = [[TheClass allc] init]; // Warns if no +allc or -allc method exists on any class

When the `--warn-unknown-ivars` option is specified, NilScript checks all JavaScript identifiers prefixed with an underscore.  A warning is produced when such an identifier is used in a method declaration and the current class lacks a corresponding `@property` or instance variable declaration.

```
@class TheClass
    
@property String foo;
    
- (void) checkFoo {
    if (_foi) {  // Warns, likely typo
    }    
}
    
@end
```

When the `--warn-unused-ivars` option is specified, NilScript warns about ivar declarations that are unused within an implementation.

```
@class TheClass {
    id _unused; // Warns
}
@end
```

When the `--warn-unknown-selectors` option is used, NilScript checks each selector against all known selectors.

---
## <a name="typechecking"></a>Type Checking

When the `--check-types` option is used, NilScript performs static type checking via [TypeScript](http://www.typescriptlang.org).  

NilScript uses an Objective-C inspired syntax for types, which is automatically translated to and from TypeScript types:

| NilScript Type     | TypeScript type / Description                                                      
|--------------------|------------------------------------------------------------------
| `Number`           | `number`
| `Boolean`, `BOOL`  | `boolean`
| `String`           | `string`
| `Array<Number>`    | An array of numbers, corresponds to the `number[]` TypeScript type.
| `Object<Number>`   | A JavaScript object used as a string-to-number map. corresponds to the `{ [i:string]: number }` TypeScript type
| `Object`, `any`    | The `any` type (which effectively turns off typechecking)
| `TheType`          | The JavaScript type (as defined by the `lib.d.ts` TypeScript file) or an instance of an NilScript class
| `Array<TheType>`   | A typed array, corresponds to the `TheType[]` TypeScript type.
| `Object<TheType>`  | A JavaScript object used as a string-to-TheType map. corresponds to the `{ [i:string]: TheType }` TypeScript type
| `id<ProtocolName>` | An object which conforms to the specified protocol name(s)
| `id`               | A special aggregate type containing all known instance methods definitions.
| `Class`            | A special aggregate type containing all known class methods definitions.
| `SEL`              | A special type that represents a selector

Most NilScript method declarations will have type information and should behave exactly as their Objective-C counterparts.  However, JavaScript functions need to be annotated via type annotations, similar to ActionScript and TypeScript:

```
function getStringWithNumber(a : String, b : Number) : String {
    return a + "-" + b;
}
```

TypeScript infers variables automatically; however, sometimes an explicit annotation is required.  This annotation is similar to TypeScript syntax:

```
function getNumber() { … }

function doSometingWithNumber() : void {
    let num : Number = getNumber(); // Annotation needed since getNumber() is not annotated
    …
}
```    
    
NilScript also provides `@type` to declare basic types.  `@type` does not affect generated code and only provides hints to the typechecker:

```
@type MyNumericType = Number;
@type MyRect = { x: Number, y: Number, width: Number, height: Number };
@type MyDoneCallback = function(completed: BOOL): void;
@type MyTypedTuple = [ Number, Number, String ];

function makeSquare(length: Number): MyRect { … }
function loadWithCallback(callback: MyDoneCallback): void { … }
```

Casting is performed via the `@cast` operator:

    let a : String = @cast(String, 3 + 4 + 6);

Sometimes you may wish to disable type checking for a specific variable or expression.  While `@cast(any, …)` accomplishes this, you can also use the `@any` convinience operator:

    let o = @any({ });

For some projects and coding styles, the default TypeScript rules may be too strict.  For example, the following is an error in typescript:

```
function example() {
    let o = { };
    // This is an error in TypeScript, as 'foo' isn't a property on the '{}' type
    o.foo = "Foo";
}
```

By default, NilScript mitigates this by casting all objects literals to the `any` type.  However, this may cause issues with function overloading when using [external type definitions](http://definitelytyped.org).  Hence, you can revert to the original TypeScript behavior via the `--strict-object-literals` option.

TypeScript also requires function calls to strictly match the parameters of the definition.  The following is allowed in JavaScript but not in TypeScript:

```
function foo(a, b) {
    …
}
    
foo(1); // Error in TS: parameter b is required
foo(1, 2, 3); // Error in TS
```

By default, NilScript mitigates this by rewriting function definitions so that all parameters are optional.  You can revert to the original TypeScript behavior via the `--strict-functions` option.

---

For performance reasons, we recommend a separate typechecker pass (in parallel with the main build), with `--check-types` enabled, `--output-language` set to `none`, and TypeScript type definitions (such as those found at [DefinitelyTyped](http://definitelytyped.org)) specified using the `--prepend` option.

NilScript tries to convert TypeScript error messages back into NilScript syntax.  Please report any confusing error messages.

---
## <a name="restrictions"></a>Restrictions

All identifiers that start with `N$` (including `N$` itself) are classified as Reserved Words and may not be used.

Inside an NilScript method declaration, `self` is added to the list of Reserved Words and may not be used as a variable name.

The NilScript compiler uses the global variable `N$_nilscript` to access the runtime. In a web browser environment, runtime.js also defines the global variable `nilscript` for the runtime.  You may use `nilscript.noConflict()` to restore the previous value of `nilscript`.  If you are using a linter or obfuscator, add both `N$_nilscript` and `nilscript` as global variable names.

In order to support compiler optimizations, the following method names are reserved and may not be overridden/implemented in subclasses:

    alloc
    class
    className
    instancesRespondToSelector:
    respondsToSelector:
    superclass
    isSubclassOfClass:
    isKindOfClass:
    isMemberOfClass:

---
## <a name="api"></a>API

Traditionally, NilScript's API consisted of a single `compile` method:

```javascript
let nsc = require("nilscript");
let options = { … };
    
nsc.compile(options, function(err, results) {
    
});
```

To allow for fast incremental compiles, NilScript 2.x adds a `Compiler` constructor:

```javascript
let nsc = require("nilscript");

// Important: create one compiler per output file.
let compiler = new nsc.Compiler();

let options = { … };

// Call doCompile() each time one of the files specified by options.files changes
function doCompile(callback) {
    compiler.compile(options, function(err, results) {
        callback(err, results);
    });
}
```

Below is a list of supported properties for `options` and `results`.  While other properties are available (see `bin/nsc`), they are not official API.

Valid properties for the `options` object:

Key                       | Type     | Description
------------------------- | -------- | ---
files                     | Array    | Strings of paths to compile, or Objects of `file` type (see below)
prepend                   | String   | Content to prepend, not compiled or typechecked
append                    | String   | Content to append, not compiled or typechecked
state                     | Private  | Input compiler state, corresponds to contents of `--input-state`
output-language           | String   | If 'none', disable source code output
simple-ivars              | Boolean  | If true, uses [simple naming for ivars](#simple-ivars)
include-map               | Boolean  | If true, include `map` key in results object
include-state             | Boolean  | If true, include `state` key in results object
source-map-file           | String   | Output source map file name
source-map-root           | String   | Output source map root URL
before-compile            | Function | Before-compile callback (see below)
after-compile             | Function | After-compile callback (see below)
squeeze                   | Boolean  | Enable squeezer
squeeze-start-index       | Number   | Start index for squeezer
squeeze-end-index         | Number   | End index for squeezer
check-types               | Boolean  | Enable type checker
defs                      | Array    | Additional typechecker definition files (same format as `files`)
typescript-lib            | String   | Built-in type declarations (`tsc --lib`)
no-implicit-any           | Boolean  | Disallow implicit any (`tsc --noImplicitAny`)
no-implicit-returns       | Boolean  | Disallow implicit returns (`tsc --noImplicitReturns`)
no-unreachable-code       | Boolean  | Disallow unreachable code (inverse of `tsc --allowUnreachableCode`)
strict-functions          | Boolean  | Enforce TypeScript-style functions
strict-object-literals    | Boolean  | Enforce TypeScript object literals
warn-global-no-type       | Boolean  | Warn about missing type annotations on @globals
warn-this-in-methods      | Boolean  | Warn about usage of 'this' in NilScript methods
warn-self-in-non-methods  | Boolean  | Warn about usage of 'self' in non-NilScript methods
warn-unknown-ivars        | Boolean  | Warn about unknown ivars
warn-unknown-selectors    | Boolean  | Warn about usage of unknown selectors
warn-unused-ivars         | Boolean  | Warn about unused ivars

Valid properties for each `file` or `defs` object:

Key      | Type    | Description
-------- | ------- | ---
path     | String  | Path of file     
contents | String  | Content of file                                                  |     
time     | Number  | Modification time of the file (ms since 1970)                    |

Properties for the `result` object:

Key     | Type    | Description
------- | ------- | ---
code    | String  | Compiled JavaScript source code
state   | Private | Output compiler state (if `include-state` is true).  See [Compiling Projects](#compiling-projects) below.
map     | String  | Source map (if `include-map` is true)
squeeze | Object  | Map of squeezed identifiers to original identifiers.  See [Squeezing and Symbolication](#squeeze) below.


The `before-compile` key specifies a callback which is called prior to the compiler's NilScript->js stage.  This allows you to preprocess files.  After this callback is invoked, a file's content must be valid NilScript or JavaScript.

The `after-compile` key specifies a callback which is called each time the compiler generates JavaScript code for a file.  This allows you to run the generated JavaScript through a linter (such as [ESLint](http://eslint.org)), or allows further transformations via [Babel](https://babeljs.io).  When this callback is invoked, a file's content will be valid JavaScript.


```javascript
// Simple preprocessor example.  Strips out #pragma lines and logs to console
options["before-compile"] = function(file, callback) {
    let inLines = file.getContents().split("\n");
    let outLines = [ ];

    inLines.forEach(line => {
        if (line.indexOf("#pragma") == 0) {
            console.log("Pragma found in: " + file.getPath());

            // Push an empty line to maintain the same # of lines
            outLines.push("");

        } else {
            outLines.push(line);
        }
    });
    
    file.setContents(outLines.join("\n"));
    
    callback();
}

// ESLint example
options["after-compile"] = function(file, callback) {
    if (!linter) linter = require("eslint").linter;

    // file.getContents() returns the generated source as a String
    _.each(linter.verify(file.getContents(), linterOptions), function(warning) {
        // file.addWarning(line, message) adds a warning at a specific line
        file.addWarning(warning.line, warning.message);
    });
    
    // linter#verify() is synchronous and doesn't produce errors, so just call callback()
    callback();
};

// Babel example
options["after-compile"] = function(file, callback) {
    if (!babel) babel = require("babel-core");
    
    // retainLines must be true or NilScript's output source map will be useless
    babelOptions.retainLines = true;

    try {
        let result = babel.transform(file.getContents(), babelOptions);

        // file.setContents() updates the generated source code with a string.
        // This string must have a 1:1 line mapping to the original string
        file.setContents(result.code);

    } catch (e) {
        file.addWarning(e.loc.line, e.message);
    }

    // Babel's transform API is synchronous
    callback();
};
```


Note: `options.state` and `result.state` are private objects and the format/contents will change between releases.  Users are encouraged to use the new `Compiler#uses` API rather than `state`. (See below).

--

NilScript 2.x also adds the `symbolicate` function as API.  This converts an internal NilScript identifier such as `N$_f_stringWithString_` to a human-readable string (`"stringWithString:"`).  See [Squeezing and Symbolication](#squeeze) below.

---
## <a name="compiler-projects"></a>Compiling Projects

The easiest way to use NilScript is to pass all `.ns` and `.js` files in your project into `nsc` and produce a single `.js` output file.  In general: the more files you compile at the same time, the easier your life will be.  However, there are specific situations where a more-complex pipeline is needed.

In our usage, we have two output files: `core.js` and `webapp.js`.

`core.js` contains our model and model-controller classes.  It's used by our client-side web app (running in the browser), our server-side backend (running in node/Express), and our iOS applications (running in a JavaScriptCore JSContext).

`webapp.js` is used exclusively by the client-side web app and contains HTML/CSS view and view-controller classes.  In certain cases, `webapp.js` needs to allocate classes directly from `core.js`.

In previous versions of NilScript, this was accomplished via the `--output-state` and `--input-state` compiler flags, or the `options.state`/`result.state` properties in the compiler API.  The state output from `core.js` would be passed as the state input to `webapp.js`.

NilScript 2 introduces a new `Compiler` API with `Compiler#uses` and `Compiler#compile`.  This allows both incremental compiles, and allows for more efficient state sharing:

```javascript
let nsc = require("nilscript");
let coreCompiler   = new nsc.Compiler();
let webAppCompiler = new nsc.Compiler();
    
let coreOptions   = { … };
let webAppOptions = { … };

// This tells webAppCompiler to always pull the last state from coreCompiler 
//
// It's your responsibility to watch files for changes and kick off the correct
// doXCompile() functions.
//
// If core.js includes the compiled result of foo.ns, a change to foo.ns 
// needs to call *both* doCoreCompile() and doWebAppCompile()
//
webAppCompiler.uses(coreCompiler);
    
// These functions are called due to file modification events (fs.watch)
function doCoreCompile(callback) {
    coreCompiler.compile(coreOptions, function(err, results) {
        callback(err, results);
    });
}
        
function doWebAppCompile(callback) {
    webAppCompiler.compile(webAppOptions, function(err, results) {
        callback(err, results);
    });
}    
```

1. All lower-level `.js` and `.ns` files are passed into `coreCompiler` via `coreOptions`.
2. The compiler products a `result` object. `result.code` is saved as `core.js`.
3. All higher-level `.js` and `.ns` files are passed into `webAppCompiler`.  `webAppCompiler` pulls state from `coreCompiler` due to the `Compiler#uses` API.
4. The `result.code` from this compilation pass is saved as `webapp.js`.
5. Both `core.js` and `webapp.js` are included (in that order) in various HTML files via `<script>` elements.
6. The NilScript runtime (`runtime.js`) is also included in various HTML files.  You can obtain its location via the `getRuntimePath` API.

--

We've found it best to run a separate typecheck pass in parallel with the `core.js`/`webapp.js` build (via a separate `node` process).  This allows one CPU to be dedicated to typechecking while the other performs transpiling.  The typecheck pass uses the following options:

* All `.js` and `.ns` files (From steps #1 and #3) are passed as `INPUT_FILES` (or `options.files`).
* Several `.d.ts` definitions (for jQuery, underscore, etc.) are specified with the `--defs` option (or `options.defs`).
* `--output-language` is set to `none`.
* `--check-types` is enabled 

---
## <a name="squeeze"></a>Squeezing and Symbolication

As mentioned in previous sections, NilScript uses internal identifier names for classes, methods, and ivars.  These identifiers are always prefixed with `N$_…`:

Type                     | Humand-readable name  | Internal Identifier
------------------------ | -------- | ---
Class                    | `TheClass` | `N$_c_TheClass`
Protocol                 | `TheProtocol` | `N$_p_TheProtocol`
Instance variable        | `_theIvar` | `N$_i__theIvar`
Method                   | `-doSomethingWithFoo:bar:baz:` | `N$_f_doSomethingWithFoo_bar_baz_`

Since these identifiers can be quite long (and aid in competitor's reverse-engineering efforts), NilScript features a code minifier/compressor/obfuscator called the squeezer. 

When the `--squeeze` option is passed to the compiler, each `N$_…` identifier is replaced with a shortened "squeezed" version. These identifiers match the regular expression
`N\$[A-Za-z0-9]+` (`N$` followed by one or more alphanumeric characters).  For example, all occurrences of `N$_c_Foo` might be replaced with `N$a`, all occurrences of `N$_f_initWithFoo_` with `N$b`, etc.  `@global`s are also replaced in this manner.

This is a safe transformation as long as all files are squeezed together (or state is persisted via `--output-state` and `--input-state`).

The `--squeeze` compiler option adds a `squeeze` property to the compiler results.  This is a map of squeezed identifiers to original identifiers:

```javascript
{
    "N$a": "N$_c_TheClass",
    "N$b": "N$_f_initWithFoo_"
    "N$c": "N$_i__firstIvar",
    "N$d": "N$_i__secondIvar",
    "N$e": "N$_f_doSomethingWithFoo_bar_baz_",
    …
}
```

--

Symbolication is the process of transforming an internal identifier (either squeezed or unsqueezed) into a human-readable name.  This is frequently used for stack traces in crash reports.

NilScript 2.x adds `symbolicate(str, squeezeMap)` as API.  This function replaces all `N$`-prefixed identifiers in a string with the human-readable name.  If the optional `squeezeMap` parameter is
provided, squeezed identifiers are also transformed:

```javascript
let nsc = require("nilscript");

let a = nsc.symbolicate("N$_c_Foo, N$_c_Bar");                 // "Foo, Bar"
let a = nsc.symbolicate("N$_p_TheProtocol");                    // "TheProtocol"
let b = nsc.symbolicate("Exception in N$_f_stringWithString_"); // "Exception in stringWithString:"
let c = nsc.symbolicate("N$_i__anIvar");                        // "_anIvar"

// Normally, the 'squeeze' property on the compiler result object would be used for squeezeMap
let squeezeMap = { "N$a": "N$_f_stringWithString_" };
let e = nsc.symbolicate("Exception in N$a", squeezeMap); // "Exception in stringWithString:"
```

---
## <a name="license"></a>Acknowledgements

NilScript uses a modified version of [Esprima](http://esprima.org) for parsing and [TypeScript](http://www.typescriptlang.org) for type checking.

---
## <a name="license"></a>License

runtime.js is public domain.

All other files in this project are licensed under the [MIT license](http://github.com/musictheory/NilScript/raw/master/LICENSE.MIT).

