# oj

OJ is a superset of the JavaScript language that adds Objective-C-style class definitions and method names.  It also supports Objective-C features such as `@property` and both explicit and default `@synthesize`.

In contrast to (Objective-J)[], 
1. OJ always uses (consistent property names)[https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames].
2. OJ calls methods directly rather than using a dynamic dispatch.
3. OJ has full support of @property and the default synthesis of ivars/getters/setters.
4. OJ uses ECMAScript 5's strict mode to freeze instances (using `Object.freeze`) after `+alloc` is called.


## Why call methods?

Using a dynamic dispatch
1) messages to nil/null
2) Method forwarding
3) 


