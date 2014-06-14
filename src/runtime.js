/*
    runtime.js, runtime for the oj language
    by musictheory.net, LLC.

    Public Domain.
*/

;(function() { "use strict";

var root = this;
var previousOj = root.oj;

var sDebugStackDepth = 0;
var sDebugCallbacks  = null;
var _classNameToMakerArrayMap = { };
var _classNameToClassMap      = { };
var _classNameToSuperNameMap  = { };

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


function _registerClass(nameObject, superObject, callback)
{
    var isSubclassOfBase = false;

    if (!superObject) {
        superObject = { BaseObject: 1 };
        isSubclassOfBase = true;
    }

    var name = sel_getName(nameObject); 
    var superName = sel_getName(superObject);

    var makerArray;
    var cls;

    _classNameToSuperNameMap[name] = superName;
    var maker = function() {
        var superclass = isSubclassOfBase ? BaseObject : _classNameToClassMap[superName];
        if (!superclass) return;     

        var instance_methods = { };
        var class_methods    = { };
        
        cls = callback(class_methods, instance_methods);

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

        _classNameToClassMap[name] = cls;

        var makerArray = _classNameToMakerArrayMap[name];
        if (makerArray) {
            for (var i = 0, length = makerArray.length; i < length; i++) {
                makerArray[i]();
            }
        }
    }

    if (isSubclassOfBase || _classNameToClassMap[superName]) {
        maker();
    } else {
        makerArray = _classNameToMakerArrayMap[superName];
        
        if (makerArray) {
            makerArray.push(maker);
        } else {
            _classNameToMakerArrayMap[superName] = [ maker ]
        }
    }
}


function noConflict()
{
    root.oj = previousOj;
}


function getClassList()
{
    var results = [ ];

    for (var key in _classNameToClassMap) { if (hop(_classNameToClassMap, key)) {
        results.append(_classNameToClassMap[key]);
    }}

    return results;
}


function getSubclassesOfClass(cls)
{
    var results = [ ];
    var name = class_getName(cls);

    for (var key in _classNameToSuperNameMap) { if (hop(_classNameToSuperNameMap, key)) {
        var superName = _classNameToSuperNameMap[key];

        if (superName == name) {
            results.push(_classNameToClassMap[key]);
        }
    }}

    return results;
}


function getClass(name)
{
    if (!name) return null;

    if ((typeof name) != "string") {
        name = sel_getName(name);
    }

    var g = _classNameToClassMap[name];
    return g ? g() : null;
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
    return cls ? cls.$oj_name : null;
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


function msgSend(receiver, selector)
{
    return receiver ? (
        receiver[sel_getName(selector)] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array.prototype.slice.call(arguments, 2)) : receiver;
}
msgSend.displayName = "oj.msgSend";


function msgSend_Object_keys(receiver, selector)
{
    return receiver ? (
        receiver[Object.keys(selector)[0]] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array.prototype.slice.call(arguments, 2)) : receiver;
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
        result = receiver.apply(Array.prototype.slice.call(arguments, 2));
        if (sDebugCallbacks && sDebugCallbacks.didSendMessage)  sDebugCallbacks.didSendMessage(arguments);

    } finally {
        sDebugStackDepth--;
    }

    return result;
}
msgSend_debug.displayName = "oj.msgSend";


var oj = {
    _id:                      0,
    _registerClass:           _registerClass,
    _cls:                     _classNameToClassMap,

    noConflict:               noConflict,

    getClassList:             getClassList,
    getSubclassesOfClass:     getSubclassesOfClass,
    getClass:                 getClass,
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

if (typeof module != "undefined" && typeof module != "function") {
    module.exports = oj;

    if (typeof global != "undefined" && typeof global != "function") {
        global.$oj_oj = oj;
    }

} else if (typeof define === "function" && define.amd) {
    define(oj);
} else {
    root.oj = root.$oj_oj = oj;
}

}).call(this);
