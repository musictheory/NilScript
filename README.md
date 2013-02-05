# oj

OJ is a superset of the JavaScript language that adds Objective-C-style class definitions and method names.  It also supports Objective-C features such as `@property` and both explicit and default `@synthesize`.

*Note: oj is currently a work in progress and isn't functional yet*

## Why?


## Differences from Objective-J

In contrast to [Objective-J](http://en.wikipedia.org/wiki/Objective-J): 
  1. OJ always uses [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames).
   This allows the resulting JavaScript code to be optimized using Closure Compiler's ADVANCED_OPTIMIZATIONS or the Mauler in [our branch of UglifyJS](https://github.com/musictheory/uglifyjs).
  2. OJ uses the native Javascript runtime to call methods rather than imitating the Objective-C runtime (see below).
  3. OJ has full support of @property and the default synthesis of ivars/getters/setters.
  4. OJ uses ECMAScript 5's strict mode to seal instances (using `Object.seal`) after `+alloc` is called.


## Why is the runtime simple (with no message forwarding, dynamic resolution of methods, NSInvocation, NSMethodSignature, etc)?

Mainly, I don't use those features.  I'm not opposed to their addition, as long as there isn't a performance hit.

That said, oj supports:
1) null/nil/undefined messaging (returns null)
2) Using @selector and performSelector: (thus supporting the target/action paradigm) 


## Instance variables

By default, a `@property` named `foo` will automatically declare a backing instance 
variable (ivar) named `_foo`.  At `+alloc`/`$oj.class_createInstance` time, This ivar will
be initialized to one of the following values based on its type:

    Boolean, BOOL   -> false
    Number          -> 0
    everything else -> null

Additional instance variables may be added to an `@implementation` as follows:

    @implementation MyClass : OJObject {
        BOOL   _additionalBoolean;  // Initialized to false
        Number _additionalNumber;   // Initialized to 0
        var    _additionalObject;   // Initialized to null
    }

    // Makes _myString ivar and -setString:/-string methods.  Initialized to null
    @property (strong) String myString;


## Selectors

In order to support  [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames), 
selectors are not encoded as strings (as in Objective-C and Objective-J).  Instead, they use an object literal syntax:

    @selector(foo:bar:baz:) -> { foo_bar_baz_: 1 }

Thus, a call such as:
    
    [object foo:7 bar:8 baz:9]
    
May (depending on optimizations) be turned into:

    $oj.msg_send(object, { fo_bar_baz_: 1 }, 7, 8, 9)

Use `$oj.sel_getName()` to obtain a string representation of the object literal.


## Properties and Synthesis

All valid Objective-C attributes may be used on a declared property.  Some are ignored
due to differences in JavaScript and Objective-C:

    nonatomic, atomic    -> Ignored
    unsafe_unretained,
    weak, strong, retain -> Ignored (all JavaScript objects are garbage collected)
    copy                 -> A copy of the object is made (using -copyWithZone:) before assigning to ivar
    getter=              -> Changes the name of the getter/accessor
    setter=              -> Changes the name of the setter/mutator
    readonly, readwrite  -> Default is readwrite, readonly suppresses the generation of a setter

By default, `@property` uses automatic synthesis behavior of Xcode 4.4+ to
automatically create a backing ivar, setters, and getters. `@synthesize` may
be used to map a property to a different ivar.  `@dynamic` may be used to
suppress the generation of setters/getters.


    



