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
  - [Scope and @class](#class-scope)
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
- [Runtime](#runtime)
- [Restrictions](#restrictions)
- [Squeezing oj!](#squeeze)
- [Hinting](#hinting)
- [Type Checking](#typechecking)
- [Compiler API](#compiler-api)
- [License](#license)


### Differences from Objective-J

In contrast to [Objective-J](http://en.wikipedia.org/wiki/Objective-J): 

  - oj always uses [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames).
   This allows the resulting JavaScript code to be optimized using Closure Compiler's ADVANCED_OPTIMIZATIONS or the Mauler in [our branch of UglifyJS](https://github.com/musictheory/uglifyjs).
  - oj uses the native JavaScript runtime to call methods rather than imitating the Objective-C runtime (see below).
  - oj has full support of @property and the default synthesis of ivars/getters/setters.

---

## <a name="class"></a>Classes

While Objective-C uses `@interface` to define a class interface and `@implementation` for its implementation, oj only uses `@implementation` (due to the lack of header files in JavaScript).  Information that would normally appear in the `@interface` block, such as `@property` declarations or the inherited superclass instead appear in `@implementation`.

### <a name="class-syntax"></a>Basic syntax

The syntax to create an empty oj class looks like this:

    @implementation TheClass
    @end

To inherit from a superclass, use a colon followed by the superclass name:

    @implementation TheSubClass : TheSuperClass 
    @end

Additional [instance variables](#ivar) can be added by using a block after class name (or superclass name):

    @implementation TheClass {
        String _myStringInstanceVariable;    
    }
    @end

    @implementation TheSubClass : TheSuperClass {
        String _myStringInstanceVariable;    
    }
    @end

### <a name="class-compiler"></a>Behind the scenes (Class)

Behind the scenes, the oj compiler changes the `@implementation`/`@end` block into a JavaScript function block.  Hence, private functions and variables may be declared inside of an `@implementation` without polluting the global namespace.

    @implementation TheClass
    var sPrivateStaticVariable = "Private";
    function sPrivate() { }
    @end

becomes equivalent to:

    oj_private_function(…, function() {
        var sPrivateStaticVariable = "Private";
        function sPrivate() { }
    });

### <a name="class-scope"></a>Scope and @class

When compiling oj files separately, the oj compiler needs a [forward declaration](http://en.wikipedia.org/wiki/Forward_declaration) 
to know that a specific identifier is actually an oj class.  This is accomplished via the `@class` directive.

For example, assume the following files:

    // TheFirstClass.oj
    @implementation TheFirstClass
    @end

and

    // TheSecondClass.oj
    @implementation TheSecondClass
    
    - (TheFirstClass) makeFirst {
        return [[TheFirstClass alloc] init];
    }

    @end

Without the forward declaration, the compiler thinks that `TheFirstClass` in `[[TheFirstClass alloc] init]` is a variable named `TheFirstClass`.  With the `@class` directive, the compiler understands that `TheFirstClass` is an oj class.

---

## <a name="base-class"></a>The Built-in Base Class

Unlike Objective-C, all oj classes inherit from a private root base class.  There is no way to specify your own root class (how often do you *not* inherit from NSObject in your code?).

The root base class provides the following methods:

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

While oj 0.x supported `+load` and `+initialize`, this feature was removed in oj 1.x to optimize runtime performance.  Note: `+className` and `-className` are intended for debugging purposes only.  When `--squeeze` is passed into the compiler, class names will be obfuscated/shortened.

---
### <a name="method"></a>Methods

Methods are defined in an `@implementation` block and use standard Objective-C syntax:

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

Old-school bare method declarations may also be used:

    @implementation TheClass
    
    - doSomethingWithString:string andNumber:number
    {
        return string + "-" + number;    
    }
    
    @end


### <a name="method-falsy"></a>Falsy Messaging

Just as Objective-C supports messaging `nil`, oj supports the concept of "Falsy Messaging".

Any message to a falsy JavaScript value (false / undefined / null / 0 / "" / NaN ) will return that value.  

    var foo = null;
    var result = [foo doSomething];  // result is null


### <a name="method-compiler"></a>Behind the Scenes (Methods)

Behind the scenes, oj methods are simply renamed JavaScript functions.  Each colon (`:`) in a method name is replaced by an underscore and a prefix is added to the start of the method name.

Hence:

    - (String) doSomethingWithString:(String)string andNumber:(Number)number
    {
        return string + "-" + number;    
    }

becomes the equivalent of:

    TheClass.prototype.$oj_f_doSomethingWithString_andNumber_ = function(string, number)
    {
        return string + "-" + number;    
    }

Messages to an object are simply JavaScript function calls wrapped in a falsey check.  Hence:

     var result = [anObject doSomethingWithString:"Hello" andNumber:0];
     
becomes the equivalent of:

     var result = anObject && anObject.doSomethingWithString_andNumber_("Hello", 0);
     
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

    @implementation TheClass {
        Number _privateNumberIvar;
    }
    
    @property Number publicNumberProperty; // Generates publicNumberProperty ivar
    
    - (Number) addPublicAndPrivateNumbers
    {
        return _privateNumberIvar + _publicNumberIvar;
    }
    
    @end


### <a name="property-synthesis"></a>Synthesis 

Properties are defined using the `@property` keyword in an `@implementation` block:

    @implementation TheClass
    @property String myStringProperty;
    @end

In the above example, the compiler will automatically synthesize a backing instance variable `_myStringProperty` for `myStringProperty`.  It will also create an accessor method pair: `-setMyStringProperty:` and `-myStringProperty`.

If a different backing instance variable is desired, the `@synthesize` directive is used:

    @implementation TheClass
    @property String myStringProperty;
    
    // Maps myStringProperty property to m_myStringProperty instance variable
    @synthesize myStringProperty=m_MyStringProperty;
    @end

As in Objective-C, `@synthesize` without an `=` results in the same name being used for the backing instance variable:

    @implementation TheClass
    @property String myStringProperty;
    
    // Maps myStringProperty property to myStringProperty instance variable
    @synthesize myStringProperty;
    @end

The `@dynamic` directive suppresses the generation of both the backing instance variable and the setter/getter pair.

    @implementation TheClass
    @property String myStringProperty;
    @dynamic myStringProperty; // No instance variable, getter, nor setter is synthesized
    @end


In addition, multiple properties may be specified in `@synthesize` and `@dynamic`:

    @synthesize prop1, prop2, prop3=m_prop3;
    @dynamic dynamic1,dynamic2;


### <a name="property-using"></a>Using

To access any instance variable, simply use its name.  No `this.` or `self.` prefix is needed:

    - (void) logSheepCount
    {
        console.log(_numberOfSheep);
    }


### <a name="property-attributes"></a>Property Attributes

All valid Objective-C attributes may be used on a declared property:

    @property (nontomic,copy,getter=myStringGetter) String myString;

However, some are ignored due to differences between JavaScript and Objective-C:

    nonatomic, atomic    -> Ignored
    unsafe_unretained,
    weak, strong, retain -> Ignored (all JavaScript objects are garbage collected)
    copy                 -> A copy of the object is made (using -copy) before assigning to ivar
    getter=              -> Changes the name of the getter/accessor
    setter=              -> Changes the name of the setter/mutator
    readonly, readwrite  -> Default is readwrite, readonly suppresses the generation of a setter


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

    @interface TheClass

    @property (Number) counter;

    - (void) incrementCounter
    {
        _counter++;
    }
    
    @end
    
would compile into:
    
    oj.makeClass(…, function(…) {
    
    … // Compiler generates -setCounter: and -counter here

    ….incrementCounter = function() {
        this.$oj_i_TheClass__counter++;
    }

    });

---
## <a name="callbacks"></a>Callbacks

Javascript frequently requires `.bind(this)` on callbacks.  For example:

    Counter.prototype.incrementAfterDelay = function(delay) {
        setTimeout(function() {
            this.count++;
            this.updateDisplay();
        }.bind(this), delay);       // Bind needed for 'this' to work
    }

oj handles the binding for you.  No additional code is needed to access ivars or `self`:

    - (void) incrementAfterDelay:(Number)delay
    {
        setTimeout(function() {
            _count++;
            [self updateDisplay];
        }, delay);
    }


---
### <a name="type-annotations"></a>Type Annotations

As JavaScript is an untyped language, types expressed in property and method declarations are mostly for documentation purposes.  That said, oj provides an experimental [Type Checker](#typechecker) to help catch errors at compile time. 

oj adds type annotations to JavaScript functions and variables, similar to ActionScript and TypeScript:

    function getStringWithNumber(a : String, b : Number) : String {
        return a + "-" + b;
    }

    function printFooAndRandom() : void {
        var a : String = "Foo";
        var b : Number = Math.random(); 
        console.log(a, "-", b);
    }

oj also has a cast operator.  It may be used similar in syntax to C++'s `static_cast`:

    var a : String = @cast<String>( 3 + 4 + 6 );

or via function syntax:

    var a : String = @cast(String, 3 + 4 + 6);

When compiling to JavaScript, type annotations and the cast operator are removed.  They are used by the experimental type checker.


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

    var nope = NO;
    var yep  = YES;
    var anObject = nil;
    
becomes:

    var nope = false;
    var yep  = true;
    var anObject = null;
      
---
## <a name="enum"></a>@enum and @const

oj supports C-style enumerations via the `@enum` keyword and constants via the `@const` keyword:

    @enum OptionalEnumName {
        zero = 0,
        one,
        two,
        three = 3,
        four
    }

    @const TheConstant = "Hello World";

    someFunction(zero, one, two, three, four, TheConstant);

By default, oj compiles the above to:

    var zero  = 0;
    var one   = 1;
    var two   = 2;
    var three = 3;
    var four  = 4;

    var TheConstant = "Hello World";

    someFunction(zero, one, two, three, four, TheConstant);

However, when the `--inline-enum` option is passed into the oj compiler, oj inlines enum values:

    someFunction(0, 1, 2, 3, 4, TheConstant);

The `--inline-const` option inlines `TheConstant` as well:
    
    someFunction(0, 1, 2, 3, 4, "Hello World");

Note: Inlining causes the enum or const to be lifted to the global scope.  Inlining affects all occurrences of that identifier in all files for the current compilation.  Inlined enums/consts are persisted via `--output-state` and `--input-state`.

---
## <a name="protocols"></a>Protocols

Like Objective-C, oj supports protocols with both required and optional methods:

    @protocol ControllerDelegate
    @required
    - (void) controller:(Controller)controller didPerformAction:(String)action;
    @optional
    - (BOOL) controller:(Controller)controller shouldPerformAction:(String)action;
    @end


A class implements protocols with the following syntax:

    @implementation TheClass <ControllerDelegate, TabBarDelegate>
    
    @end

Protocols are specified in parameters, properties, and return types via the `id<ProtocolName>` type:

    @implementation Controller 
    @property id<ControllerDelegate> delegate
    @end

Unlike Objective-C, there is no `NSObject` protocol.  Instead, all protocols extend a built-in base protocol, which has identical methods to the [built-in base class](#base-class).

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

---
## <a name="squeeze"></a>Squeezing oj!

oj features a code minifier/compressor/obfuscator called the squeezer.  When the `--squeeze` option is passed to the compiler, all identifiers for classes (`$oj_c_ClassName`), methods (`$oj_f_MethodName`) and ivars (`$oj_i_ClassName_IvarName`) will be replaced with a shortened "squeezed" version (`$oj$ID`).  For example, all occurrences of `$oj_c_Foo` might be assigned the identifier `$oj$a`, all occurrences of `$oj_f_initWithFoo_` might be assigned `$oj$b`.  This is a safe transformation as long as all files are squeezed together.

Squeezed identifiers are persisted via `--output-state` and `--input-state`.

---
## <a name="hinting"></a>Hinting

oj provides basic code hinting to catch common errors.

When the `--warn-unknown-selectors` option is specified, oj warns about usage of undefined selectors/methods.  This can help catch typos at compile time:

    var c = [[TheClass allc] init]; // Warns if no +allc or -allc method exists on any class

When the `--warn-unknown-ivars` option is specified, oj checks all JavaScript identifiers prefixed with an underscore.  A warning is produced when such an identifier is used in a method declaration and the current class lacks a corresponding `@property` or instance variable declaration.

    @implementation TheClass
    
    @property String foo;
    
    - (void) checkFoo {
        if (_foi) {  // Warns, likely typo
        }    
    }
    
    @end

When the `--warn-unused-ivars` option is specified, oj warns about ivar declarations that are unused within an implementation.

    @implementation TheClass {
        id _unused; // Warns
    }
    @end
    
When the `--warn-unknown-selectors` option is used, oj checks each selector against all known selectors.

When the `--jshint` option is used, [JSHint](http://www.jshint.com) hints oj's results.  To prevent false positives,  the following options are forced:

    asi:      true
    laxbreak: true
    laxcomma: true
    newcap:   false

`expr: true` is enabled on a per-method basis when the oj compiler uses certain optimizations.

The `--jshint-ignore` option may be used to disable specific JSHint warnings.

---
## <a name="typechecking"></a>Type Checking

When the `--check-types` option is used, oj performs static type checking via [TypeScript](http://www.typescriptlang.org).  This feature is still experimental.

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

    var ojc = require("ojc");
    var options = { ... };
    
    ojc.compile(options, function(err, results) {
    
    });

Below is a list of supported properties for `options` and `results`.  While other properties are available (see `bin/ojc`), they are not yet official API.

Properties for the `options` object:

| Key                    | Type    | Description                                                      |
|------------------------|---------|------------------------------------------------------------------|
| files                  | Array   | Strings of paths to compile, or Objects of `file` type (see below)  |
| state                  | Object  | Input compiler state, corresponds to contents of `--input-state` |
| inline-const           | Boolean | inline @const identifiers                                        |
| inline-enum            | Boolean | inline @enum identifiers                                         |
| warn-this-in-methods   | Boolean | warn about usage of 'this' in oj methods                         |
| warn-unknown-selectors | Boolean | warn about usage of unknown selectors                            |
| warn-unknown-ivars     | Boolean | warn about unknown ivars                                         |
| warn-unused-ivars      | Boolean | warn about unused ivars                                          |

Valid properties for each `file` object:

| Key                    | Type    | Description                                                      |
|------------------------|---------|------------------------------------------------------------------|
| path                   | String  | Path of file                                                     |     
| contents               | String  | Content of file                                                  |     

Properties for the `result` object:

| Key                    | Type    | Description                                                      |
|------------------------|---------|------------------------------------------------------------------|
| code                   | String  | Compiled JavaScript source code                                  |     
| state                  | Object  | Output compiler state                                            |     

---
## <a name="license"></a>License

runtime.js is public domain.

All other files in this project are licensed under the [MIT license](http://github.com/musictheory/oj/raw/master/LICENSE.MIT).

