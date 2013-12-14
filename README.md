# oj

oj is a superset of the JavaScript language inspired by the latest versions of Objective-C.  It features a fast, simple runtime without a dynamic messaging overhead. 

oj is designed to ease the pain of syncing class interfaces (not necessarily implementations) between Objective-C projects and their web counterparts.

In our case, we use it to sync [Tenuto](http://www.musictheory.net/buy/tenuto) with the [musictheory.net exercises](http://www.musictheory.net/exercises), and [Theory Lessons](http://musictheory.local/buy/lessons) with the [musictheory.net lessons](http://www.musictheory.net/lessons).

### Installation

    npm install ojc

### Main Features

- [Classes](#class)
  - [Basic Syntax](#class-syntax)
  - [Behind the Scenes](#class-compiler)
  - [Scope and @class](#class-scope)
- [The Built-in Base Class](#base-class)
  - [Provided Methods](#base-class-provided)
  - [Reserved Method Names](#base-class-reserved)
  - [+load and +initialize](#base-class-load-initialize)
- [Methods](#method)
  - [Falsy Messaging](#method-falsy)
  - [Behind the Scenes](#method-compiler)
- [Properties and Instance Variables](#property)
  - [Synthesis](#property-synthesis) 
  - [Using](#property-using)
  - [Property Attributes](#property-attributes) 
  - [Initialization](#property-init) 
  - [Behind the Scenes](#property-compiler)
- [Selectors](#selector)
- [Boolean/null aliases](#aliases)
- [enum and const](#enum)
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

    @implementation TheClass {
    var sPrivateStaticVariable = "Private";
    function sPrivate() { }
    @end

becomes:

    var TheClass = oj._makeClass(…, function(…) {
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

Without the forward declaration, the compiler will change `[[TheFirstClass alloc] init]` to:

    TheFirstClass.alloc().init();
    
This works as long as TheFirstClass is in the global namespace.  If you are using functions to create various levels
of scoping (a common JavaScript practice), it may break.

In this class, use the `@class` directive:

    // TheSecondClass.oj

    @class TheFirstClass;

    @implementation TheSecondClass
    
    - (TheFirstClass) makeFirst {
        return [[TheFirstClass alloc] init];
    }

    @end

Which causes the compiler to output:

    oj._cls.TheFirstClass.alloc().init();

---

## <a name="base-class"></a>The Built-in Base Class

Unlike Objective-C, all oj classes inherit from a private root base class.  There is no way to specify your own root class (how often do you *not* inherit from NSObject in your code?).

### <a name="base-class-provided"></a>Provided Methods

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


### <a name="base-class-reserved"></a>Reserved Method Names

In order to support certain compiler optimizations, the following method names are reserved and may not be overridden/implemented in subclasses):

    alloc
    class
    className
    instancesRespondToSelector:
    respondsToSelector:
    superclass
    isSubclassOfClass:
    isKindOfClass:
    isMemberOfClass:


### <a name="base-class-load-initialize"></a>+load and +initialize

oj supports both `+load` and `+initialize`.  `+load` is called immediately upon the
creation of a class (in `oj._makeClass`),  `+initialize` is called the first time a message
is sent to the class (whether it be `+alloc` or another class method)


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

Since JavaScript is an untyped language, the types indicated in the parenthesis in the above example are for documentation purposes only and optional.  Old-school bare method declarations may also be used:

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

Behind the scenes, oj methods are simply renamed JavaScript functions.  Each colon (`:`) in a method name is replaced by an underscore.

Hence:

    - (String) doSomethingWithString:(String)string andNumber:(Number)number
    {
        return string + "-" + number;    
    }

becomes the equivalent of:

    TheClass.prototype.doSomethingWithString_andNumber_ = function(string, number)
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

_Note:_ If the `--check-ivars` command-line option is passed into the compiler, JavaScript identifiers that look like instance variables (with a underscore prefix) but are not defined will produce a warning.    

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

At `+alloc`/`oj.class_createInstance` time, oj initializes all instance variables to one of the following values based on its type:

    Boolean         -> false
    Number          -> 0
    everything else -> null

This allows Number instance variables to be used in math operations  without the fear of `undefined` being converted to `NaN` by the JavaScript engine.


### <a name="property-compiler"></a>Behind the Scenes (Properties/ivars)

Unlike other parts of the oj runtime, properties and instance variables aren't intended to be accessed from non-oj JavaScript (they should be private to the subclass which defines them).  However, they may need to be accessed in the debugger.

The compiler currently uses a JavaScript property on the instance with the follow name:

    $oj_ivar_{{CLASS NAME}}_{{IVAR NAME}}


Hence, the following oj code:

    @interface TheClass

    @property (Number) counter;

    - (void) incrementCounter
    {
        _counter++;
    }
    
    @end
    
would compile into:
    
    var TheClass = oj.makeClass(…, function(…) {
    
    … // Compiler generates -setCounter: and -counter here

    ….incrementCounter = function() {
        this.$oj_ivar_TheClass__counter++;
    }

    });


---
## <a name="selector"></a>Selectors

In order to support  [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames), 
selectors are not encoded as strings (as in Objective-C and Objective-J).  Instead, they use an object literal syntax:

    @selector(foo:bar:baz:) -> { foo_bar_baz_: 1 }

Thus, a call such as:
    
    [object foo:7 bar:8 baz:9]
    
May (depending on optimizations) be turned into:

    oj.msg_send(object, { fo_bar_baz_: 1 }, 7, 8, 9)

Use `oj.sel_getName()` to obtain a string representation of the object literal.


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
## <a name="enum"></a>enum and const

If `--use-enum` is passed into the oj compiler, the reserved  keyword `enum` is interpreted with C-style semantics:

    enum OptionalName {
        zero = 0,
        one,
        two,
        three = 3,
        four
    }

becomes:

    /** @const */ var zero  = 0;
    /** @const */ var one   = 1;
    /** @const */ var two   = 2;
    /** @const */ var three = 3;
    /** @const */ var four  = 4;

If `--use-const` is passed into the oj compiler, the ECMAScript 6 keyword `const` is interpreted with the following semantics:

    const TheConstant = 42;

becomes:

    /** @const */ var TheConstant = 42;

In both cases, the output includes the `/** @const */` annotation, allowing the variable to be inlined by the compiler (closure/UglifyJS/etc) in the build process.

---
## <a name="license"></a>License

runtime.js is public domain.

All other files in this project are licensed under the [MIT license](http://github.com/musictheory/oj/raw/master/LICENSE.MIT).

