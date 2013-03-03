/*
    runtime.js, runtime for the oj language
    by musictheory.net, LLC.

    Public Domain.
*/

var oj = (function() {

var sRoot = this;
var sIDCounter = 0;
var sDebugStackDepth = 0;
var sDebugCallbacks = null;

var methodName_load       = sel_getName({ load:1       });
var methodName_initialize = sel_getName({ initialize:1 });
var methodName_$oj_super  = sel_getName({ $oj_super:1  });
var methodName_$oj_name   = sel_getName({ $oj_name:1   });

function create(o)
{
    function f() {}
    f.prototype = o;
    return new f();
};


function hop(obj, prop)
{
    return Object.prototype.hasOwnProperty.call(obj, prop);
}


function mixin(from, to, callback)
{
    for (var key in from) { if (hop(from, key) && !hop(to, key)) {
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


function createNamedFunction(name) {
    var result;
    eval("result = function " + name + " () {}")
    return result;
}


function _makeClass(superClass, name, callback)
{
    var instance_methods = { };
    var class_methods    = { };
    var key;

    var cls = callback(class_methods, instance_methods);

    var initializeMethod = class_methods.initialize;

    if (!superClass) superClass = BaseObject;
    mixin(superClass, cls);

    mixin(class_methods, cls, function(key, method) {
        method.displayName = getDisplayName(cls.displayName, key, "+");
    });

    // If we have a +initialize, wrap each class method
    if (initializeMethod) {
        var didInitialize = false;

        for (var key in cls) { if (hop(cls, key)) {
            if (key == methodName_load || key == methodName_initialize ||
                key == "prototype"     || key == "displayName"         ||
                key == methodName_$oj_super ||
                key == methodName_$oj_name)
            {
                continue;
            }

            var original = cls[key];

            cls[key] = function() {
                if (initializeMethod) {
                    initializeMethod.call(this);
                    initializeMethod = null;
                }

                original.call(this);
            }

            cls[key].displayName = original.displayName;
        }}
    }

    cls.prototype   = new superClass();
    cls.displayName = sel_getName(name);

    cls.$oj_super = superClass;
    cls.$oj_name  = name;

    mixin(instance_methods, cls.prototype, function(key, method) {
        method.displayName = getDisplayName(cls.displayName, key, "-");
    });

    sRoot[sel_getName(name)] = cls;

    if (class_methods.load) class_methods.load(this);

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
    // Class names are encoded using the same { selectorName : 1 } syntax
    // as selectors.  Thus, pass through sel_getName
    //
    return sel_getName(cls.$oj_name);
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
    _makeClass:               _makeClass,

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
