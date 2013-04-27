/*
    runtime.js, runtime for the oj language
    by musictheory.net, LLC.

    Public Domain.
*/

var oj = (function() { "use strict";

var sDebugStackDepth = 0;
var sDebugCallbacks = null;
var sPendingClasses = { };
var sAllClasses = { };


function create(o)
{
    function f() {}
    f.prototype = o;
    return new f();
}


function hop(obj, prop)
{
    return Object.prototype.hasOwnProperty.call(obj, prop);
}


function mixin(from, to, overwrite, callback)
{
    for (var key in from) { if (hop(from, key) && (overwrite || !hop(to, key))) {
        var value = from[key];
        if (callback) callback(key, value);
        to[key] = value;
    }}
}


function getDisplayName(className, methodName, prefix)
{
    methodName = methodName.replace(/([A-Za-z0-9])_/g, "$1:");
    return [ prefix, "[", className, " ", methodName, "]" ].join("");
}


function throwUnrecognizedSelector(receiver, selector)
{
    throw new Error("Unrecognized selector: " + sel_getName(selector) + " sent to instance " + receiver);
}


function makeInitializeWrapper(original)
{
    var f = function() {
        if (this.$oj_needs_initialized) {
            class_initialize(this);
            this.$oj_needs_initialized = false;
        }

        return original.call(this);
    }

    f.displayName = original.displayName;

    return f;
}


function makeInitializeWrapperForClass(cls, methods)
{
    var methodName_load       = sel_getName({ load:1       });
    var methodName_initialize = sel_getName({ initialize:1 });

    for (var key in methods) { if (hop(methods, key)) {
        if (key == methodName_load || key == methodName_initialize) {
            continue;
        }

        var original = methods[key];
        if (typeof original != "function") {
            continue;
        }

        cls[key] = makeInitializeWrapper(methods[key]);
    }}
}


function _makeClass(nameObject, superObject, callback, cls, class_methods, instance_methods)
{
    // nameObject and superObject are passed in with {name:1}
    // object-literal syntax.
    //
    var superName = sel_getName(superObject); 
    var superclass = oj._classes[superName];

    if (!instance_methods) instance_methods = { };
    if (!class_methods)    class_methods    = { };
    if (!cls) cls = callback(class_methods, instance_methods);

    // We have a superclass specified, but it hasn't been _makeClass'd yet.
    if (superName && !superclass) {
        var pending = sPendingClasses[superName];
        if (!pending) pending = sPendingClasses[superName] = [ ];

        pending.push([ nameObject, superObject, callback, cls, class_methods, instance_methods ]);

        return cls;
    }

    if (!superclass) superclass = BaseObject;

    var name = sel_getName(nameObject);

    cls.displayName = name;
    cls.$oj_name    = name;
    cls.$oj_super   = superclass;
    cls.prototype   = new superclass();

    mixin(superclass, cls);

    mixin(class_methods, cls, true, function(key, method) {
        method.displayName = getDisplayName(name, key, "+");
    });

    mixin(instance_methods, cls.prototype, true, function(key, method) {
        method.displayName = getDisplayName(name, key, "-");
    });


    // If we have a +initialize, wrap each new class method
    var initialize = cls.initialize;
    if (initialize) {
        cls.$oj_needs_initialized = true;

        makeInitializeWrapperForClass(cls, class_methods);

        if (superclass == BaseObject) {
            makeInitializeWrapperForClass(cls, BaseObject);
        }
    }

    sAllClasses[name] = cls;

    if (class_methods.load) class_methods.load.apply(cls);

    // Make pending classes classes
    (function() {
        var pending = sPendingClasses[name];

        if (pending) {
            for (var i = 0, length = pending.length; i < length; i++) {
                _makeClass.apply(null, pending[i]);
            }

            delete(sPendingClasses[name]);
        }
    }());

    return cls;
}


function isObject(object)
{
    return !!(object && object.constructor.$oj_name);
}


function setDebugCallbacks(callbacks)
{
    sDebugCallbacks = callbacks;
}


function sel_getName(selector)
{
    if (!selector) return null;

    var name = Object.keys && Object.keys(selector)[0];

    if (!name) {
        for (var key in selector) { if (selector.hasOwnProperty(key)) {
            return key;
        }}
    }

    return name;
}


function sel_isEqual(sel1, sel2)
{
    return sel_getName(sel1) == sel_getName(sel2);
}


function class_getName(cls)
{
    return cls.$oj_name;
}


function class_initialize(cls)
{
    var chain = [ cls ];
    var initialize = cls.initialize;

    while ((cls = class_getSuperclass(cls))) {
        chain.push(cls);
    }


    for (var i = chain.length - 1; i >= 0; i--) {
        cls = chain[i];

        if (cls.$oj_needs_initialized && cls.initialize) {
            cls.initialize.call(cls);
            cls.$oj_needs_initialized = false;
        }
    }
}


function class_getSuperclass(cls)
{
    return cls.$oj_super;
}


function class_isSubclassOf(cls, superclass)
{
    while (cls) {
        if (cls === superclass) return true;
        cls = class_getSuperclass(cls);
    }

    return false;
}


function object_getClass(object)
{
    return object.constructor;
}


function class_respondsToSelector(cls, selector)
{
    return !!cls.prototype[sel_getName(selector)];
}


var Array_prototype_slice = Array.prototype.slice;

function msgSend(receiver, selector)
{
    return receiver ? (
        receiver[sel_getName(selector)] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array_prototype_slice.call(arguments, 2)) : receiver;
}
msgSend.displayName = "oj.msgSend";


function msgSend_Object_keys(receiver, selector)
{
    return receiver ? (
        receiver[Object.keys(selector)[0]] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array_prototype_slice.call(arguments, 2)) : receiver;
}
msgSend_Object_keys.displayName = "oj.msgSend";


function msgSend_debug(receiver, selector)
{
    if (!receiver) return receiver;

    var name = sel_getName(selector);
    var imp  = receiver[imp];

    if (!imp) {
        throwUnrecognizedSelector(receiver, selector)
    }

    if (++sDebugStackDepth > 256) {
        throw new Error("Maximum call stack depth exceeded.");
    }

    var result;
    try {
        if (sDebugCallbacks && sDebugCallbacks.willSendMessage) sDebugCallbacks.willSendMessage(arguments);
        result = receiver.apply(Array_prototype_slice.call(arguments, 2));
        if (sDebugCallbacks && sDebugCallbacks.didSendMessage)  sDebugCallbacks.didSendMessage(arguments);

    } finally {
        sDebugStackDepth--;
    }

    return result;
}
msgSend_debug.displayName = "oj.msgSend";


var BaseObject = function BaseObject() { }

BaseObject.alloc = function() { return new this(); }
BaseObject["class"] = function() { return this; }
BaseObject.superclass = function() { return class_getSuperclass(this); }
BaseObject.className = function() { return class_getName(this); }
BaseObject.respondsToSelector_ = function(aSelector) { return !!this[sel_getName(aSelector)]; }
BaseObject.instancesRespondToSelector_ = function(aSelector) { return class_respondsToSelector(this, aSelector); }
BaseObject.isKindOfClass_ = function(cls) { return class_isSubclassOf(this, cls); }
BaseObject.isMemberOfClass_ = function(cls) { return this === cls; }
BaseObject.isSubclassOfClass_ = function(cls) { return class_isSubclassOf(this, cls); }
BaseObject.isEqual_ = function(other) { return this === other; }

BaseObject.prototype.init = function() { return this; }
BaseObject.prototype.copy = function() { return object_getClass(this).alloc().init(); }
BaseObject.prototype.superclass = function() { return class_getSuperclass(object_getClass(this)); }
BaseObject.prototype["class"] = function() { return object_getClass(this); }
BaseObject.prototype.className = function() { return class_getName(object_getClass(this)); }
BaseObject.prototype.respondsToSelector_ = function(aSelector) { return class_respondsToSelector(object_getClass(this), aSelector); }
BaseObject.prototype.performSelector_ = function(aSelector) { return oj.msgSend(this, aSelector); }
BaseObject.prototype.performSelector_withObject_ = function(aSelector, object) { return oj.msgSend(this, aSelector, object); }
BaseObject.prototype.performSelector_withObject_withObject_ = function(aSelector, o1, o2) { return oj.msgSend(this, aSelector, o1, o2); }
BaseObject.prototype.description = function() { return "<" + this.className() + " " + this.$oj_id + ">" }
BaseObject.prototype.toString = function() { return this.description(); }
BaseObject.prototype.isKindOfClass_ = function(cls) { return class_isSubclassOf(object_getClass(this), cls); }
BaseObject.prototype.isMemberOfClass_ = function(cls) { return object_getClass(this) === cls; }
BaseObject.prototype.isEqual_ = function(other) { return this === other; }

return {
    _id:                      0,
    _makeClass:               _makeClass,
    _classes:                 sAllClasses,

    getClassList:             function() { return sAllClasses; },
    isObject:                 isObject,
    sel_getName:              sel_getName,
    sel_isEqual:              sel_isEqual,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_isSubclassOf:       class_isSubclassOf,
    class_respondsToSelector: class_respondsToSelector,
    object_getClass:          object_getClass,
    msgSend:                  Object.keys ? msgSend_Object_keys : msgSend,
    msgSend_debug:            msgSend_debug,
    setDebugCallbacks:        setDebugCallbacks
}


}());
