# oj

OJ is a superset of the JavaScript language that adds Objective-C-style class definitions and method names.  It also supports Objective-C features such as `@property` and both explicit and default `@synthesize`.

*Note: oj is currently a work in progress and isn't functional yet*

## Why?


## Differences from Objective-J

In contrast to [Objective-J](http://en.wikipedia.org/wiki/Objective-J): 
  1. OJ always uses [consistent property names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames).
   This allows the resulting JavaScript code to be optimized using Closure Compiler's ADVANCED_OPTIMIZATIONS or the Mauler in [our branch of UglifyJS](https://github.com/musictheory/uglifyjs).
  2. OJ calls methods directly rather than using a dynamic dispatch.  Support for `@selector` and `-performSelector:...` is present for the target/action paradigm.
  3. OJ has full support of @property and the default synthesis of ivars/getters/setters.
  4. OJ uses ECMAScript 5's strict mode to freeze instances (using `Object.freeze`) after `+alloc` is called.


## Why is the runtime simple (with no dynamic dispatch)?

Mainly, I'm concerned about the performance impact of sending every method call through $oj_msgSend.  

For my code base, the one big benefit of using $oj_msgSend would be the ability to message undefined/null
objects and receive a falsey value back.  However, I'm worried about subtle bugs appearing due to this.

For example:

    if ([object isSelected] == [anotherObject isSelected]) {
    
    }

If object is undefined or null, this will result in a comparison of undefined/null to a boolean true/false, which will
always fail.

    if (null == false) {
       // Code never reached!
    }
  

That said, I'm open to adding an *option* for dynamic dispatch in the future.


## Instance variables

By default, a `@property` named `foo` will automatically declare a backing instance 
variable (ivar) named `_foo`.  At `+alloc`/`$oj_class_createInstance` time, This ivar will
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


    



