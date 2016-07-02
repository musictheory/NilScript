# oj

oj is a superset of the JavaScript language inspired by the latest versions of Objective-C.  It features a fast, simple runtime without a dynamic messaging overhead. 

oj is designed to ease the pain of syncing class interfaces (not necessarily implementations) between Objective-C projects and their web counterparts.

In our case, we use it to sync [Tenuto](http://www.musictheory.net/buy/tenuto) with the [musictheory.net exercises](http://www.musictheory.net/exercises), and [Theory Lessons](http://musictheory.net/buy/lessons) with the [musictheory.net lessons](http://www.musictheory.net/lessons).

### Installation

    npm install ojc

### Main Features

- [Classes](#class)
  - [Basic Syntax](#class-syntax)
  - [Behind the Scenes](#class-compiler)
  - [Forward Declarations](#at-class)
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
- [Callbacks](#callbacks)
- [Selectors](#selector)
- [Protocols](#protocols)
- [Boolean/null aliases](#aliases)
- [@enum and @const](#enum)
- [@global](#global)
- [Runtime](#runtime)
- [Restrictions](#restrictions)
- [Squeezing oj!](#squeeze)
- [Hinting](#hinting)
- [Type Checking](#typechecking)
- [Compiler API](#compiler-api)
- [Compiling Projects](#compiling-projects)
- [License](#license)


### Differences from Objective-J

In contrast to [Objective-J](http://en.wikipedia.org/wiki/Objective-J): 

  - oj always uses [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames).
   This allows the resulting JavaScript code to be optimized using Closure Compiler's ADVANCED_OPTIMIZATIONS.
  - oj uses the native JavaScript runtime to call methods rather than imitating the Objective-C runtime (see below).
  - oj focuses on being a language, not a framework.  The only requirement at runtime is the `runtime.js` file.
  - oj has full support of @property and the default synthesis of ivars/getters/setters.
  - oj includes a [built-in obfuscator](#squeeze) which hides method and class names in compiled code.

---

## <a name="class"></a>Classes

While Objective-C uses `@interface` to define a class interface and `@implementation` for its implementation, oj only uses `@implementation` (due to the lack of header files in JavaScript).  Information that would normally appear in the `@interface` block, such as `@property` declarations or the inherited superclass instead appear in `@implementation`.

### <a name="class-syntax"></a>Basic syntax

The syntax to create an empty oj class looks like this:

```
@implementation TheClass
@end
```

To inherit from a superclass, use a colon followed by the superclass name:

```
@implementation TheSubClass : TheSuperClass 
@end
```

Additional [instance variables](#ivar) can be added by using a block after class name (or superclass name):

```
@implementation TheClass {
    String _myStringInstanceVariable;    
}
@end

@implementation TheSubClass : TheSuperClass {
    String _myStringInstanceVariable;    
}
@end
```

### <a name="class-compiler"></a>Behind the scenes (Class)

Behind the scenes, the oj compiler changes the `@implementation`/`@end` block into a JavaScript function block which is invoked at runtime.  Private functions and variables may be declared inside of an `@implementation` without polluting the global namespace.

```
@implementation TheClass
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

Note: Only `@property`, `@synthesize`, `@dynamic`, instance variable declarations, method declarations, variable declarations, or function declarations may be used inside of an `@implementation` block.

### <a name="at-class"></a>Forward Declarations

In older versions of oj (0.x), the compiler would compile each file separately.  This led to situations where a [forward declaration](http://en.wikipedia.org/wiki/Forward_declaration) of a class was needed:

```
@class TheFirstClass;

@implementation TheSecondClass
    
- (void) foo {
    // Without the forward declaration, oj 0.x didn't know if TheFirstClass
    // was a JS identifier or an oj class.
    [TheFirstClass doSomething];
}

@end
```

oj 1.x+ uses a multi-pass compiler which eliminates the need for forward declarations.  In general, the need to use `@class` indicates an underlying issue with the dependency tree, which will cause issues if you need to use `@const`/`@enum` inlining or the [squeezer](#squeeze).  For more information, read [Compiling Projects](#compiling-projects).  

---

## <a name="base-class"></a>The Built-in Base Class

Unlike Objective-C, all oj classes inherit from a private root base class.  There is no way to specify your own root class (how often do you *not* inherit from NSObject in your code?).

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

While oj 0.x supported `+load` and `+initialize`, this feature was removed in oj 1.x to optimize runtime performance.  Note: `+className` and `-className` are intended for debugging purposes only.  When `--squeeze` is passed into the compiler, class names will be obfuscated/shortened.

---
### <a name="method"></a>Methods

Methods are defined in an `@implementation` block and use standard Objective-C syntax:

```
@implementation TheClass
    
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
@implementation TheClass
    
- doSomethingWithString:string andNumber:number
{
    return string + "-" + number;    
}
    
@end
```

### <a name="method-falsy"></a>Falsy Messaging

Just as Objective-C supports messaging `nil`, oj supports the concept of "Falsy Messaging".

Any message to a falsy JavaScript value (false / undefined / null / 0 / "" / NaN ) will return that value.  

```
let foo = null;
let result = [foo doSomething];  // result is null
```

### <a name="method-compiler"></a>Behind the Scenes (Methods)

Behind the scenes, oj methods are simply renamed JavaScript functions.  Each colon (`:`) in a method name is replaced by an underscore and a prefix is added to the start of the method name.

Hence:

```
- (String) doSomethingWithString:(String)string andNumber:(Number)number
{
    return string + "-" + number;    
}
```

becomes the equivalent of:

```
TheClass.prototype.$oj_f_doSomethingWithString_andNumber_ = function(string, number)
{
    return string + "-" + number;    
}
```

Messages to an object are simply JavaScript function calls wrapped in a falsey check.  Hence:

     let result = [anObject doSomethingWithString:"Hello" andNumber:0];
     
becomes the equivalent of:

     let result = anObject && anObject.doSomethingWithString_andNumber_("Hello", 0);
     
The compiler will produce slightly different output depending on:

 - if the return value is needed
 - if the message receiver is a JavaScript expression.
 - if the message receiver is known to be non-falsey
 - if the message receiver is `self`
 - if the message receiver is `super`

Sometimes the compiler will choose to use `oj.msgSend()` rather than a direct function call.

---
## <a name="property"></a>Properties and Instance Variables

oj uses the Objective-C 2.0 `@property` syntax which originally appeared in Mac OS X 10.5 Leopard.  It also supports the concept of default property synthesis added in Xcode 4.4.

In addition, oj allows storage for additional instance variables (ivars) to be defined on a class.

A class that uses a property, private ivar, and accesses them in a method may look like this:

```
@implementation TheClass {
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

Properties are defined using the `@property` keyword in an `@implementation` block:

```
@implementation TheClass
@property String myStringProperty;
@end
```

In the above example, the compiler will automatically synthesize a backing instance variable `_myStringProperty` for `myStringProperty`.  It will also create an accessor method pair: `-setMyStringProperty:` and `-myStringProperty`.

If a different backing instance variable is desired, the `@synthesize` directive is used:

```
@implementation TheClass
@property String myStringProperty;
    
// Maps myStringProperty property to m_myStringProperty instance variable
@synthesize myStringProperty=m_MyStringProperty;
@end
```

As in Objective-C, `@synthesize` without an `=` results in the same name being used for the backing instance variable:

```
@implementation TheClass
@property String myStringProperty;
    
// Maps myStringProperty property to myStringProperty instance variable
@synthesize myStringProperty;
@end
```

The `@dynamic` directive suppresses the generation of both the backing instance variable and the setter/getter pair.

```
@implementation TheClass
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

All valid Objective-C attributes may be used on a declared property:

    @property (nontomic,copy,getter=myStringGetter) String myString;

However, some are ignored due to differences between JavaScript and Objective-C.

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `nonatomic`, `atomic` | Ignored since JavaScript is single-threaded
| `unsafe_unretained`, `weak`, `strong`, `retain` | Ignored since Javascript objects are garbage collected
| `nonnull`, `nullable`, `null_resettable`, `null_unspecified` | Currently ignored
| `getter=` | Changes the name of the getter/accessor
| `setter=` | Changes the name of the setter/mutator
| `copy`, `struct`  | Creates a copy (See below)
| `readonly`, `readwrite` | Default is readwrite, readonly suppresses the generation of a setter

`copy` uses `oj.makeCopy` in the setter.

`struct` uses `oj.makeCopy` in both the setter and the getter.  It is intended to assist the porting of C `struct`s, which are pass-by-value rather than pass-by-reference.

```
@property (copy) Foo foo;
@property (struct) Bar bar;
@property Baz baz;

// Synthesized methods:

- (void) setFoo:(Foo)foo { _foo = oj.makeCopy(foo); }
- (Foo) foo { return _foo; }

- (void) setBar:(Bar)bar { _bar = oj.makeCopy(bar); }
- (Bar) bar { return oj.makeCopy(_bar); }

- (void) setBaz:(Bar)bar { _baz = baz; }
- (Baz) baz { return _baz; }
```


### <a name="property-init"></a>Initialization

During `+alloc`, oj initializes all instance variables to one of the following values based on its type:

    Boolean         -> false
    Number          -> 0
    everything else -> null

This allows Number instance variables to be used in math operations  without the fear of `undefined` being converted to `NaN` by the JavaScript engine.


### <a name="property-compiler"></a>Behind the Scenes (Properties/ivars)

Unlike other parts of the oj runtime, properties and instance variables aren't intended to be accessed from non-oj JavaScript (they should be private to the subclass which defines them).  However, they may need to be accessed in the debugger.

The compiler currently uses a JavaScript property on the instance with the follow name:

    $oj_i_{{CLASS NAME}}_{{IVAR NAME}}


Hence, the following oj code:

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
oj.makeClass(…, function(…) {
    
… // Compiler generates -setCounter: and -counter here

….incrementCounter = function() {
    this.$oj_i_TheClass__counter++;
}

});
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

oj handles the binding for you.  No additional code is needed to access ivars or `self`:

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

    @selector(foo:bar:baz:) -> { $oj_f_foo_bar_baz_: 1 }

Thus, a call such as:
    
    [object foo:7 bar:8 baz:9]
    
May (depending on optimizations) be turned into:

    oj.msg_send(object, { $oj_f_foo_bar_baz_: 1 }, 7, 8, 9)


---
## <a name="aliases"></a>Boolean/null aliases

The oj compiler adds the following keywords for Boolean/null values and replaces them to their JavaScript equivalent:

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

oj supports C-style enumerations via the `@enum` keyword and constants via the `@const` keyword:

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

By default, oj compiles the above to:

```
var zero  = 0;
var one   = 1;
var two   = 2;
var three = 3;
var four  = 4;

var TheConstant = "Hello World";

someFunction(zero, one, two, three, four, TheConstant);
```

However, when the `--inline-enum` option is passed into the oj compiler, oj inlines enum values:

    someFunction(0, 1, 2, 3, 4, TheConstant);

The `--inline-const` option inlines `TheConstant` as well:
    
    someFunction(0, 1, 2, 3, 4, "Hello World");

Note: Inlining causes the enum or const to be lifted to the global scope.  Inlining affects all occurrences of that identifier in all files for the current compilation.  Inlined enums/consts are persisted via `--output-state` and `--input-state`.

---
## <a name="global"></a>@global

To mimic C APIs such as CoreGraphics, oj has the ability to declare global functions and variables with `@global`.

```
@global function CGRectMake(x: Number, y: Number, width: Number, height: Number): void {
    return { origin: { x, y }, size: { width, height } };
}
    
@global CGRectZero = CGRectMake(0, 0, 0, 0);
@global CGRectNull = CGRectMake(Infinity, Infinity, 0, 0);
```

Which transforms into the equivalent of:

```
$oj_oj._g.CGRectMake = function(x, y, width, height) {
    return { origin: { x, y }, size: { width, height } };
}
    
$oj_oj._g.CGRectZero = $oj_oj._g.CGRectMake(0, 0, 0, 0);
$oj_oj._g.CGRectNull = $oj_oj._g.CGRectMake(Infinity, Infinity, 0, 0);
```

Unlike inlined enums and consts, globals are assigned at runtime.  Hence, in the above code example, care must be given that `CGRectMake()` isn't used for initializing `CGRectZero` until after the `@global function CGRectMake` line.  This limitation should not affect globals used from within oj methods (as the global will already be declared by that time).

---
## <a name="protocols"></a>Protocols

Like Objective-C, oj includes support for protocols.  Both `@required` and `@optional` methods may be specified:

```
@protocol ControllerDelegate
@required
- (void) controller:(Controller)controller didPerformAction:(String)action;
@optional
- (BOOL) controller:(Controller)controller shouldPerformAction:(String)action;
@end

@implementation Controller
@property id<ControllerDelegate> delegate
…
@end

@implementation TheClass <ControllerDelegate, TabBarDelegate>
- (void) controller:(Controller)controller didPerformAction:(String)action { … }
…
@end
```

Unlike Objective-C, there is no `NSObject` protocol.  Instead, all protocols extend a built-in base protocol, which has identical methods to the [built-in base class](#base-class).
    
Protocol conformance is enforced by the [typechecker](#typechecker).

---
## <a name="runtime"></a>Runtime

**oj.noConflict()**  
Restores the `oj` global variable to its previous value.


**oj.getClassList()**  
Returns an array of all known oj Class objects.


**oj.class_getSuperclass(cls) /  oj.getSuperclass(cls)**  
Returns the superclass of the specified `cls`.

**oj.getSubclassesOfClass(cls)**  
Returns an array of all subclasses of the specified `cls`.

**oj.isObject(object)**  
Returns true if `object` is an oj instance or Class, false otherwise.

**oj.sel_isEqual(aSelector, bSelector)**  
Returns true if two selectors are equal to each other.

**oj.class_isSubclassOf(cls, superclass)**  
Returns true if `superclass` is the direct superclass of `cls`, false otherwise.

**oj.class_respondsToSelector(cls, aSelector)**  
Returns true if instances of `cls` respond to the selector `aSelector`, false otherwise.

**oj.object_getClass(object)**  
Returns the Class of `object`.

**oj.msgSend(receiver, aSelector, ...)**  
If `receiver` is non-falsy, invokes `aSelector` on it.

**oj.sel_getName(aSelector)**  
**oj.class_getName(cls)**  
**-[BaseObject className]**  
Returns a human-readable string of a class or selector.  Note that this is for debug purposes only!  When `--squeeze` is passed into the compiler, the resulting class/selector names will be obfuscated/shortened.

**oj.makeCopy(object)**  
If `object` is an oj instance, invokes `-copy`.  If `object` is a JavaScript array, returns a shallow clone (via `slice(0)`).  If `object` is a JavaScript primitive, returns `object`.  Else, returns a clone of each key/value pair (via `Object.keys`) on `object`.

---
## <a name="squeeze"></a>Squeezing oj!

oj features a code minifier/compressor/obfuscator called the squeezer.  When the `--squeeze` option is passed to the compiler, all identifiers for classes (`$oj_c_ClassName`), methods (`$oj_f_MethodName`), ivars (`$oj_i_ClassName_IvarName`), and `@global`s will be replaced with a shortened "squeezed" version (`$oj$ID`).  For example, all occurrences of `$oj_c_Foo` might be assigned the identifier `$oj$a`, all occurrences of `$oj_f_initWithFoo_` might be assigned `$oj$b`.  This is a safe transformation as long as all files are squeezed together.

Squeezed identifiers are persisted via `--output-state` and `--input-state`.

---
## <a name="hinting"></a>Hinting

oj provides basic code hinting to catch common errors.

When the `--warn-unknown-selectors` option is specified, oj warns about usage of undefined selectors/methods.  This can help catch typos at compile time:

    let c = [[TheClass allc] init]; // Warns if no +allc or -allc method exists on any class

When the `--warn-unknown-ivars` option is specified, oj checks all JavaScript identifiers prefixed with an underscore.  A warning is produced when such an identifier is used in a method declaration and the current class lacks a corresponding `@property` or instance variable declaration.

```
@implementation TheClass
    
@property String foo;
    
- (void) checkFoo {
    if (_foi) {  // Warns, likely typo
    }    
}
    
@end
```

When the `--warn-unused-ivars` option is specified, oj warns about ivar declarations that are unused within an implementation.

```
@implementation TheClass {
    id _unused; // Warns
}
@end
```

When the `--warn-unknown-selectors` option is used, oj checks each selector against all known selectors.

---

oj integrates with [JSHint](http://www.jshint.com) via the `--jshint` option; however, this feature is deprecated and will be removed in the future (2.x).  Many JSHint warnings are duplicated by the [typechecker](#typechecking).

To prevent false positives, the following JSHint options are forced: `asi: true`, `laxbreak: true`, `laxcomma: true`, `newcap:   false`.

`expr: true` is enabled on a per-method basis when the oj compiler uses certain optimizations.

The `--jshint-ignore` option may be used to disable specific JSHint warnings.

---
## <a name="typechecking"></a>Type Checking

When the `--check-types` option is used, oj performs static type checking via [TypeScript](http://www.typescriptlang.org).  

oj uses an Objective-C inspired syntax for types, which is automatically translated to and from TypeScript types:

| oj Type            | TypeScript type / Description                                                      
|--------------------|------------------------------------------------------------------
| `Number`           | `number`
| `Boolean`, `BOOL`  | `boolean`
| `String`           | `string`
| `Array<Number>`    | An array of numbers, corresponds to the `number[]` TypeScript type.
| `Object<Number>`   | A JavaScript object used as a string-to-number map. corresponds to the `{ [i:string]: number }` TypeScript type
| `Object`, `any`    | The `any` type (which effectively turns off typechecking)
| `TheType`          | The JavaScript type (as defined by the `lib.d.ts` TypeScript file) or an instance of an oj class
| `Array<TheType>`   | A typed array, corresponds to the `TheType[]` TypeScript type.
| `Object<TheType>`  | A JavaScript object used as a string-to-TheType map. corresponds to the `{ [i:string]: TheType }` TypeScript type
| `id<ProtocolName>` | An object which conforms to the specified protocol name(s)
| `id`               | A special aggregate type containing all known instance methods definitions.
| `Class`            | A special aggregate type containing all known class methods definitions.
| `SEL`              | A special type that represents a selector

Most oj method declarations will have type information and should behave exactly as their Objective-C counterparts.  However, JavaScript functions need to be annotated via type annotations, similar to ActionScript and TypeScript:

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
    
oj also provides `@type` to declare basic types.  `@type` does not affect generated code and only provides hints to the typechecker:

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

By default, oj mitigates this by casting all objects literals to the `any` type.  However, this may cause issues with function overloading when using [external type definitions](http://definitelytyped.org).  Hence, you can revert to the original TypeScript behavior via the `--strict-object-literals` option.

TypeScript also requires function calls to strictly match the parameters of the definition.  The following is allowed in JavaScript but not in TypeScript:

```
function foo(a, b) {
    …
}
    
foo(1); // Error in TS: parameter b is required
foo(1, 2, 3); // Error in TS
```

By default, oj mitigates this by rewriting function definitions so that all parameters are optional.  You can revert to the original TypeScript behavior via the `--strict-functions` option.

---

For performance reasons, we recommend a separate typechecker pass (in parallel with the main build), with `--check-types` enabled, `--output-language` set to `none`, and TypeScript type definitions (such as those found at [DefinitelyTyped](http://definitelytyped.org)) specified using the `--prepend` option.

oj tries to convert TypeScript error messages back into oj syntax.  Please report any confusing error messages.

---
## <a name="restrictions"></a>Restrictions

All identifiers that start with `$oj_` or `$oj$` are classified as Reserved Words.

Inside an oj method declaration, `self` is added to the list of Reserved Words.  Hence, it may not be used as a variable name.

The oj compiler uses the global variable `$oj_oj` to access the runtime.  You should not use `$oj_oj` directly or modify it in your source code.  In a web browser environment, runtime.js also defines the global variable `oj` for the runtime.  You may use `oj.noConflict()` to restore the previous value of `oj`.  If you are using a linter or obfuscator, add both `$oj_oj` and `oj` as global variable names.

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
## <a name="compiler-api"></a>Compiler API

Traditionally, oj's API consisted of a single `compile` method:

```javascript
let ojc = require("ojc");
let options = { … };
    
ojc.compile(options, function(err, results) {
    
});
```

To allow for fast incremental compiles, oj 2.x adds a `Compiler` constructor:

```javascript
let ojc = require("ojc");

// Important: create one compiler per output file.
let compiler = new ojc.Compiler();

let options = { … };

// Call doCompile() each time one of the files specified by options.files changes
function doCompile(callback) {
    compiler.compile(options, function(err, results) {
        callback(err, results);
    });
}
```

Below is a list of supported properties for `options` and `results`.  While other properties are available (see `bin/ojc`), they are not official API.

Valid properties for the `options` object:

Key                      | Type     | Description
------------------------ | -------- | ---
files                    | Array    | Strings of paths to compile, or Objects of `file` type (see below)
prepend                  | String   | Content to prepend, not compiled or typechecked
append                   | String   | Content to append, not compiled or typechecked
state                    | Private  | Input compiler state, corresponds to contents of `--input-state`
output-language          | String   | If 'none', disable source code output
include-map              | Boolean  | If true, include `map` key in results object
include-state            | Boolean  | If true, include `state` key in results object
include-symbols          | Boolean  | If true, include `symbols` key in results object
source-map-file          | String   | Output source map file name
source-map-root          | String   | Output source map root URL
before-compile           | Function | Before-compile callback (see below)
after-compile            | Function | After-compile callback (see below)
inline-const             | Boolean  | inline @const identifiers
inline-enum              | Boolean  | inline @enum identifiers
squeeze                  | Boolean  | If true, enable squeezer
squeeze-start-index      | Number   | Start index for squeezer
squeeze-end-index        | Number   | End index for squeezer
check-types              | Boolean  | Enable type checker
defs                     | Array    | Additional typechecker definition files (same format as `files`)
typescript-lib           | String   | Alternate lib.d.ts file
no-implicit-any          | Boolean  | If true, disallow implicit any
strict-functions         | Boolean  | If true, enforce TypeScript-style functions
strict-object-literals   | Boolean  | If true, enforce TypeScript object literals
warn-debugger            | Boolean  | warn about use of 'debugger' statement
warn-empty-array-element | Boolean  | warn about empty array element
warn-global-no-type      | Boolean  | warn about missing type annotations on @globals
warn-this-in-methods     | Boolean  | warn about usage of 'this' in oj methods
warn-unknown-ivars       | Boolean  | warn about unknown ivars
warn-unknown-selectors   | Boolean  | warn about usage of unknown selectors
warn-unused-ivars        | Boolean  | warn about unused ivars

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
state   | Private | Output compiler state (if `include-state` is true).  See Compiling Projects below.
map     | String  | Source map (if `include-map` is true)
symbols | Object  | Symbol-to-readable-name map (if `include-symbols` is true).  For symbolicating stack traces.


The `before-compile` key specifies a callback which is called prior to the compiler's oj->js stage.  This allows you to preprocess files.  After this callback is invoked, a file's content must be valid oj or JavaScript.

The `after-compile` key specifies a callback which is called each time the compiler generates JavaScript code for a file.  This allows you to run the generated JavaScript through a linter (such as [JSHint](http://jshint.com) or [ESLint](http://eslint.org)), or allows further transformations via [Babel](https://babeljs.io).  When this callback is invoked, a file's content will be valid JavaScript.


```javascript
// Simple preprocessor example.  Strips out #pragma lines and logs to console
ojOptions["before-compile"] = function(file, callback) {
    let inLines = file.getContents().split("\n");
    let outLines = [ ];

    inLines.forEach(line => {
        if (line.indexOf("#pragma") == 0) {
            console.log("Pragma found in: " + file.getPath());
        } else {
            outLines.push(line);
        }
    });
    
    file.setContents(outLines.join("\n"));
    
    callback();
}

// ESLint example
ojOptions["after-compile"] = function(file, callback) {
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
ojOptions["after-compile"] = function(file, callback) {
    if (!babel) babel = require("babel-core");
    
    // retainLines must be true or oj's output source map will be useless
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

---
## <a name="compiler-projects"></a>Compiling Projects

The easiest way to use oj is to pass all `.oj` and `.js` files in your project into `ojc` and produce a single `.js` output file.  In general: the more files you compile at the same time, the easier your life will be.  However, there are specific situations where a more-complex pipeline is needed.

In our usage, we have two output files: `core.js` and `webapp.js`.

`core.js` contains our model and model-controller classes.  It's used by our client-side web app (running in the browser), our server-side backend (running in node/Express), and our iOS applications (running in a JavaScriptCore JSContext).

`webapp.js` is used exclusively by the client-side web app and contains HTML/CSS view and view-controller classes.  In certain cases, `webapp.js` needs to allocate classes directly from `core.js`.

In previous versions of oj, this was accomplished via the `--output-state` and `--input-state` compiler flags, or the `options.state`/`result.state` properties in the compiler API.  The state output from `core.js` would be passed as the state input to `webapp.js`.

oj 2 introduces a new `Compiler` API with `Compiler#uses` and `Compiler#compile`.  This allows both incremental compiles, and allows for more efficient state sharing:

```javascript
let ojc = require("ojc");
let coreCompiler   = new ojc.Compiler();
let webAppCompiler = new ojc.Compiler();
    
let coreOptions   = { … };
let webAppOptions = { … };

// This tells webAppCompiler to always pull the last state from coreCompiler 
//
// It's your responsibility to watch files for changes and kick off the correct
// doXCompile() functions.
//
// If core.js includes the compiled result of foo.oj, a change to foo.oj 
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

1. All lower-level `.js` and `.oj` files are passed into `coreCompiler` via `coreOptions`.
2. The compiler products a `result` object. `result.code` is saved as `core.js`.
3. All higher-level `.js` and `.oj` files are passed into `webAppCompiler`.  `webAppCompiler` pulls state from `coreCompiler` due to the `Compiler#uses` API.
4. The `result.code` from this compilation pass is saved as `webapp.js`.
5. Both `core.js` and `webapp.js` are included (in that order) in various HTML files via `<script>` elements.

--

We've found it best to run a separate typecheck pass in parallel with the `core.js`/`webapp.js` build (via a separate `node` process).  This allows one CPU to be dedicated to typechecking while the other performs transpiling.  The typecheck pass uses the following options:

* All `.js` and `.oj` files (From steps #1 and #3) are passed as `INPUT_FILES` (or `options.files`).
* Several `.d.ts` definitions (for jQuery, underscore, etc.) are specified with the `--defs` option (or `options.defs`).
* `--output-language` is set to `none`.
* `--check-types` is enabled 

---
## <a name="license"></a>License

runtime.js is public domain.

All other files in this project are licensed under the [MIT license](http://github.com/musictheory/oj/raw/master/LICENSE.MIT).

