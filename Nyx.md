# Nyx

Nyx is a superset of the JavaScript language.

NilScript is designed to ease the pain of syncing class interfaces (not necessarily implementations) between Objective-C projects and their web counterparts.

In our case, we use it to sync [Tenuto](http://www.musictheory.net/buy/tenuto) with the [musictheory.net exercises](http://www.musictheory.net/exercises), and [Theory Lessons](http://musictheory.net/buy/lessons) with the [musictheory.net lessons](http://www.musictheory.net/lessons).

NilScript was formerly known as oj.

### Installation

    npm install nilscript

### Main Features

- [Classes](#class)
  - [Basic Syntax](#class-syntax)
  - [Behind the Scenes](#class-compiler)
- [The Built-in Base Class](#base-class)
- [Methods](#method)
  - [Nullish Messaging](#method-nullish)
  - [Behind the Scenes](#method-compiler)
- [Properties](#property)
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


## Restrictions

- All identifiers that start with `N$` (including `N$` itself) are classified as Reserved Words and may not be used.

- Any identifier imported via `import` may not be used as a variable name. Likewise; the name of an `enum`, `interface`, or `type` may not be redeclared.

```
import { Foo };

enum Bar { … };
interface Baz { … };
type MyNumber = number;

let Foo = 1;          // Error: Foo may not be redeclared
function Bar(Baz) {   // Error: Bar and Baz may not be redeclared
    let MyNumber = 2; // Error: MyNumber may not be redeclared
}
```

- 



## Language Extensions

### TypeScript annotations

Nyx borrows 

The following types are supported:

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `readonly`, `readwrite`, `private` | Default is `readwrite`. `readonly` suppresses the generation of a setter. `private` suppresses the generation of both a setter and getter.
| `getter=` | Changes the name of the getter
| `setter=` | Changes the name of the setter
| `change=` | Calls the selector when the property changes. See <a href="#observers">Property Observers</a>.

Nyx extends 




### Enums

Similar to TypeScript or C, Nyx adds 

### The `func` keyword

Nyx borrows the `func` keyword from [Swift](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/functions/). This enables methods to have named parameters.

```
class Greeter {
    func greet(person: string): string {
        return `Hello, ${person}!`;
    }   
}

let greeter = new Greeter();

// Prints "Hello, Bob!"
console.log(greeter.greet(person: "Bob")); 
```

Function parameters may have different argument labels:

```
class Foo {
    func someFunction(argumentLabel parameterName: number) {
        // Inside the function body, use parameterName to reference the parameter
        // When calling this method, use foo.someFunction(argumentLabel: 42);
    }
}
```

To extend the first example:

```
class Greeter {
    func greet(person: string, from hometown: string): string {
        return `Hello ${person} from ${hometown}!`;
    }   
}

let greeter = new Greeter();

 // Prints "Hello, Bob from Livermore!"
console.log(greeter.greet(person: "Bob", from: "Livermore"));
```

As in Swift, argument labels may be blank by using an underscore (_).

```
class Foo {
    func someFunction(_ firstParameterName: number, secondParameterName: number) {
    
    }
}

let foo = new Foo();
foo.someFunction(1, secondParameterName: 2);
```

Rest parameters and binding destructuring patterns are not supported by `func` methods. For these, use a standard class method.


### The prop keyword



### Init-based initialization






### Design, Features, and Goals

---


## Legacy Extensions

### `@const`

### `@global`




### <a name="class-compiler"></a>Behind the scenes (Class)

Behind the scenes, the NilScript compiler changes the `@class`/`@end` block into a JavaScript class.

```
@class TheClass
@end
```

becomes equivalent to:

```
… = class N$_c_TheClass { // Stored into an internal class registry
}
```

Note: Only `@property` declarations or method declarations may be used inside of a `@class` block.

---

## <a name="base-class"></a>The Built-in Base Class

Unlike Objective-C, all NilScript classes inherit from a private root base class.  There is no way to specify your own root class (how often do you *not* inherit from NSObject in your code?).

The root base class provides the following methods:

```
+ (instancetype) alloc
+ (Class) class
+ (Class) superclass
+ (String) className
+ (BOOL) isSubclassOfClass:(Class)cls

+ (BOOL) instancesRespondToSelector:(SEL)aSelector

- (instancetype) init
- (id) copy

- (Class) class
- (Class) superclass
- (String) className 
- (BOOL) isKindOfClass:(Class)cls
- (BOOL) isMemberOfClass:(Class)cls

- (String) description 

- (BOOL) respondsToSelector:(SEL)aSelector

- (BOOL) isEqual:(id)anotherObject
```

Note: `+className` and `-className` are intended for debugging purposes only.  When `--squeeze` is passed into the compiler, class names will be obfuscated/shortened.

---
### <a name="method"></a>Methods

Methods are defined in a `@class` block and use standard Objective-C syntax:

```
@class TheClass
    
- (string) doSomethingWithString:(string)string andNumber:(number)number
{
    return string + "-" + number;    
}

// Returns "Foo-5"
- (string) anotherMethod
{
    return [self doSomethingWithString:"Foo" andNumber:5];
}
    
@end
```

### <a name="method-nullish"></a>Nullish Messaging

Just as Objective-C supports messaging `nil`, NilScript supports the concept of "Nullish Messaging".

Any message to a nullish JavaScript value (`undefined` or `null`) will return `null`.

```
let foo1 = null;
let foo2 = undefined;
let result1 = [foo1 doSomething];  // result1 is null
let result2 = [foo2 doSomething];  // result2 is also null
```

### <a name="method-compiler"></a>Behind the Scenes (Methods)

Behind the scenes, NilScript methods are simply method definitions on a JavaScript `class`.  Each colon (`:`) in a method name is replaced by an underscore and a prefix is added to the start of the method name.

Hence:

```
- (string) doSomethingWithString:(string)string andNumber:(number)number
{
    return string + "-" + number;    
}
```

becomes the equivalent of:

```
N$_f_doSomethingWithString_andNumber_(string, number)
{
    return string + "-" + number;    
}
```

Messages to an object become JavaScript optional chains followed by nullish coalescing to null.

```
let result = [anObject doSomethingWithString:"Hello" andNumber:0];
```
     
becomes the equivalent of:

```
let result = ((anObject?.N$_f_doSomethingWithString_andNumber_("Hello", 0))??null);
```
     
The compiler will produce slightly different output depending on:

- if the return value is needed
- if the message receiver is a JavaScript expression.
- if the message receiver is known to be non-nullish
- if the message receiver is `self` or `super`
- if the message selector is `alloc` or `class`

---
## <a name="property"></a>Properties and Instance Variables

Like Objective-C, NilScript uses the `@property` directive to define object properties. Getter
and setter methods are automatically created.

```
@class TheClass {
@property theProperty: string;
}

let theInstance = [[TheClass alloc] init];
[theInstance setTheProperty:"Hello"];
console.log([theInstance theProperty]); // Logs "Hello"
```

NilScript also uses the concept of instance variables to allow a class to "shortcut"
the getter method and directly access the property.

Instance variables may be accessed inside of `@class` method definitions by using the
property name prefixed with `_`.  No `this.` or `self.` prefix is needed.


```
@class TheClass {

@property theProperty: string;

- (void) logTheProperty
{
    console.log(_theProperty);
}

}
```

Unlike Objective-C:

- NilScript always generates an instance variable for each property.
The name of the instance variable is always a `_` followed by the
property's name. There is no concept of `@synthesize` or `@dynamic`.

- NilScript uses `@property` with a `private` attribute to define additional
instance variables rather than seperate syntax.

- NilScript has no concept of `@protected` or `@public` instance variables.
You may not use an instance variable outside of the `@class` block in which
the `@property` was defined.

- By default, the implementation of each instance variable is a simple property
on a JavaScript object. However, if an instance variable isn't directly used in 
code, the NilScript compiler may remove it or use an alternate storage mechanism.


### <a name="property-attributes"></a>Property Attributes

NilScript supports property attributes similar to Objective-C:

    @property (getter=isChecked) checked: BOOL;

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `readonly`, `readwrite`, `private` | Default is `readwrite`. `readonly` suppresses the generation of a setter. `private` suppresses the generation of both a setter and getter.
| `getter=` | Changes the name of the getter
| `setter=` | Changes the name of the setter
| `change=` | Calls the selector when the property changes. See <a href="#observers">Property Observers</a>.

Due to differences between JavaScript and Objective-C, the following attributes are not supported:

| Attribute          | Description                                                      
|--------------------|------------------------------------------------------------------
| `nonatomic`, `atomic` | Not supported since JavaScript is single-threaded
| `unsafe_unretained`, `weak`, `strong`, `retain` | Not supported since Javascript objects are garbage collected
| `nonnull`, `nullable`, `null_resettable`, `null_unspecified` | Currently not supported
| `class` | Currently not supported


### <a name="property-init"></a>Initialization

During `+alloc`, NilScript initializes all properties to one of the following values based on its type:

    Boolean         -> false
    Number          -> 0
    everything else -> null

This allows Number instance variables to be used in math operations without the fear of `undefined` being converted to `NaN` by the JavaScript engine.


### <a name="property-compiler"></a>Behind the Scenes (Properties/ivars)

Unlike other parts of the NilScript runtime, properties and instance variables aren't intended to be accessed from non-NilScript JavaScript (they should be private to the subclass which defines them).  However, they may need to be accessed in the debugger.

The compiler uses a JavaScript property on the instance object with an underscore prefix:

    _{{IVAR NAME}}


Hence, the following NilScript code:

```
@class TheClass

@property counter: Number;

- (void) incrementCounter
{
    _counter++;
}
    
@end
```

would compile into:

```
class … {
    
… // Compiler generates -setCounter: and -counter here

N$_f_incrementCounter() {
    this._counter++;
}

}
```

---
## <a name="observers"></a>Property Observers

In our internal UI frameworks, it's very common to call `-setNeedsDisplay` or `-setNeedsLayout` in response to a
property change.  For example, our Button class has a custom corner radius property:

```
@class Button : ClickableControl

…

@property cornerRadius: number;

…

- (void) setCornerRadius:(number)cornerRadius
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
@property (change=setNeedsDisplay) backgroundColor: string;
@property (change=setNeedsDisplay) cornerRadius: number;
@property (change=setNeedsDisplay) title: string;
```

This example will call `[self setNeedsDisplay]` after the backgroundColor, colorRadius, or title changes.

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
- (void) incrementAfterDelay:(number)delay
{
    setTimeout(function() {
        _count++;
        [self updateDisplay];
    }, delay);
}
```

---
## <a name="selector"></a>Selectors

Like Objective-C, selectors are encoded as strings. However, NilScript adds a private prefix and replaces colons with underscores:

    @selector(foo:bar:baz:) -> "N$_f_foo_bar_baz_"

Thus, a call such as:
    
    [object foo:7 bar:8 baz:9]
    
May (depending on optimizations) be turned into:

    nilscript.msgSend(object, "N$_f_foo_bar_baz_", 7, 8, 9)


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

Similar to Objective-C, NilScript includes support for protocols.

Protocol conformance is enforced by the [typechecker](#typechecker). Due to the underlying use of TypeScript, NilScript uses [structural typing](https://en.wikipedia.org/wiki/Structural_type_system) rather than nominal typing.

Hence, declaring protocol conformance is optional. In this example, `TheClass` conforms to `ControllerDelegate` automatically, due to implementing all of the required methods:

```
@protocol ControllerDelegate
@required
- (void) controller:(Controller)controller didPerformAction:(string)action;
@optional
- (boolean) controller:(Controller)controller shouldPerformAction:(string)action;
@end

@class TheClass
- (void) controller:(Controller)controller didPerformAction:(String)action { … }
@end
```

While not required, classes may explicitly declare protocol conformance. To do so, list the protocols after the superclass (or in lieu of a superclass). Protocols may explicitly conform to other protocols using a similar syntax.

```
@class TheClassA : TheSuperClass, ProtocolA, ProtocolB
…
@end

@class TheClassB : ProtocolA, ProtocolB
…
@end

@protocol ProtocolC : ProtocolA, ProtocolB
…
@end
```

There is no `NSObject` protocol.  Instead, all protocols extend a built-in base protocol, which has identical methods to the [built-in base class](#base-class).

NilScript uses `TheProtocol` rather than `id<TheProtocol>` for protocol type annotations. 

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

```
@class TheClass
    
@property foo: string;
    
@end
```

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
| `TheType`          | The JavaScript type (as defined by the `lib.d.ts` TypeScript file) or an instance of an NilScript class
| `Array<TheType>`   | A typed array, corresponds to the `TheType[]` TypeScript type.
| `Object<TheType>`  | A JavaScript object used as a string-to-TheType map. corresponds to the `{ [i:string]: TheType }` TypeScript type
| `ProtocolName`     | An object which conforms to the specified protocol name(s)
| `SEL`              | A special type that represents a selector
| `Object`, `any`, `id`, `Class` | The `any` type (which effectively turns off typechecking)


Most NilScript method declarations will have type information and should behave exactly as their Objective-C counterparts.  However, JavaScript functions need to be annotated via type annotations, similar to ActionScript and TypeScript:

```
function getStringWithNumber(a: string, b: number): string {
    return a + "-" + b;
}
```

TypeScript infers variables automatically; however, sometimes an explicit annotation is required.  This annotation is similar to TypeScript syntax:

```
function getNumber() { … }

function doSometingWithNumber(): void {
    let num: number = getNumber(); // Annotation needed since getNumber() is not annotated
    …
}
```    
    
NilScript also provides `@type` to declare basic types.  `@type` does not affect generated code and only provides hints to the typechecker:

```
@type MyNumericType = number;
@type MyRect = { x: number, y: number, width: number, height: number };
@type MyDoneCallback = function(completed: boolean): void;
@type MyTypedTuple = [ number, number, string ];

function makeSquare(length: Number): MyRect { … }
function loadWithCallback(callback: MyDoneCallback): void { … }
```

Casting is performed via the `@cast` operator:

    let a : String = @cast(String, 3 + 4 + 6);

Sometimes you may wish to disable type checking for a specific variable or expression:

```
    let o = { };
    // This is an error in TypeScript, as 'foo' isn't a property on the '{}' type
    o.foo = "Foo";
```

While `@cast(any, …)` accomplishes this, you can also use the `@any` convinience operator:

```
    let o = @any({ });
    o.foo = "Foo";
```

Note that TypeScript requires function calls to strictly match the parameters of the definition.  The following is allowed in JavaScript but not in TypeScript:

```
function foo(a, b) {
    …
}
    
foo(1); // Error in TS: parameter b is required
foo(1, 2, 3); // Error in TS
```

---

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
    isKindOfClass:
    isMemberOfClass:
    isSubclassOfClass:
    respondsToSelector:
    superclass

---
## <a name="api"></a>API

Traditionally, NilScript's API consisted of a single `compile` method:

```javascript
let nsc = require("nilscript");
let options = { … };

async function doCompile() {
    let results = await nsc.compile(options);

    … // Do something with results
}
```

To allow for fast incremental compiles, NilScript 2.x adds a `Compiler` constructor:

```javascript
let nsc = require("nilscript");

// Important: create one compiler per output file.
let compiler = new nsc.Compiler();

let options = { … };

// Call doCompile() each time one of the files specified by options.files changes
async function doCompile() {
    let results = compiler.compile(options);

    … // Do something with results
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


The `before-compile` key specifies a callback which is called prior to the compiler's NilScript->js stage.  This allows you to preprocess files.  The callback must return a Promise. Once the promise is resolved, a file's content must be valid NilScript or JavaScript.

The `after-compile` key specifies a callback which is called each time the compiler generates JavaScript code for a file.  This allows you to run the generated JavaScript through a linter (such as [ESLint](http://eslint.org)), or allows further transformations via [Babel](https://babeljs.io). The callback must return a Promise. When this callback is invoked, a file's content will be valid JavaScript.


```javascript
// Simple preprocessor example.  Strips out #pragma lines and logs to console
options["before-compile"] = async file => {
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
};

// ESLint example
options["after-compile"] = async file => {
    if (!linter) linter = require("eslint").linter;

    // file.getContents() returns the generated source as a String
    _.each(linter.verify(file.getContents(), linterOptions), function(warning) {
        // file.addWarning(line, message) adds a warning at a specific line
        file.addWarning(warning.line, warning.message);
    });
};

// Babel example
options["after-compile"] = async file => {
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
};
```


Note: `options.state` and `result.state` are private objects and the format/contents will change between releases.  Users are encouraged to use the new `Compiler#uses` API rather than `state`. (See below).

---

NilScript 2.x also adds the `symbolicate` function as API.  This converts an internal NilScript identifier such as `N$_f_stringWithString_` to a human-readable string (`"stringWithString:"`).  See [Squeezing and Symbolication](#squeeze) below.

---

To improve type checker performance, NilScript 3.x adds a `tuneTypecheckerPerformance` API:

`nilscript.tuneTypecheckerPerformance(includeInCompileResults, workerCount)`

Key                       | Type     | Default |
------------------------- | -------- | ------- |
includeInCompileResults   | Boolean  | `true`  |
workerCount               | Number   | `4`     |

When `includeInCompileResults` is `true`, Each call to `Compiler#compile` will wait for its associated type checker to finish. Type checker warnings are then merged with `results.warnings`.

When `includeInCompileResults` is `false`, `Compiler#compile` will start the type checker but not wait for it to finish. Warnings are accessed via the `Promise` returned from `Compiler#collectTypecheckerWarnings`. In complex projects with several `Compiler` objects, this option can result in faster compile times.

`workerCount` sets the number of node `worker_threads` used to run TypeScript compilers.


---
## <a name="compiling-projects"></a>Compiling Projects

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

---

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

