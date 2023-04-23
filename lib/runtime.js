/*
    runtime.js, runtime for the NilScript language
    by musictheory.net, LLC.

    Public Domain.
*/

;(function() { "use strict";

var root = this;
var previousNilscript = root.nilscript;

var _nameKey      = "N$_name";
var _baseClassKey = "N$_base";
var _globalKey    = "N$$_";

class NSObject {

static alloc() { return new this(); }
static class() { return this; }
static superclass() { return class_getSuperclass(this); }
static className() { return class_getName(this); }
static respondsToSelector_(aSelector) { return !!this[aSelector]; }
static instancesRespondToSelector_(aSelector) { return class_respondsToSelector(this, aSelector); }
static isSubclassOfClass_(cls) { return class_isSubclassOf(this, cls); }

init() { return this; }
copy() { return object_getClass(this).alloc().init(); }
superclass() { return class_getSuperclass(object_getClass(this)); }
class() { return object_getClass(this); }
className() { return class_getName(object_getClass(this)); }
respondsToSelector_(aSelector) { return class_respondsToSelector(object_getClass(this), aSelector); }
performSelector_(aSelector) { return msgSend(this, aSelector); }
performSelector_withObject_(aSelector, object) { return msgSend(this, aSelector, object); }
performSelector_withObject_withObject_(aSelector, o1, o2) { return msgSend(this, aSelector, o1, o2); }
description() { return "<" + this.className() + " " + this["N$_id"] + ">" }
toString() { return this.description(); }
isKindOfClass_(cls) { return class_isSubclassOf(object_getClass(this), cls); }
isMemberOfClass_(cls) { return object_getClass(this) === cls; }
isEqual_(other) { return this === other; }

}

var _classSymbolToClassMap = { "N$_base": NSObject }


function _reset()
{
    function clear(obj) {
        for (var key in obj) {
            obj[key] = undefined;
        }
    }

    clear(_classSymbolToClassMap);

    _classSymbolToClassMap[_baseClassKey] = NSObject;
}


function hop(obj, prop)
{
    return Object.prototype.hasOwnProperty.call(obj, prop);
}


function cloneJSObject(object)
{
    var keys = Object.keys(object);
    var result = { };

    for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        result[key] = object[key];
    }

    return result;
}


function _getMethodDisplayName(className, methodName, prefix)
{
    if (className.indexOf("N$_") == 0) {
        className = _getReadableForSymbol(className);
    }

    if (methodName.indexOf("N$_") == 0) {
        methodName = _getReadableForSymbol(methodName);
        methodName = methodName.replace(/([A-Za-z0-9])_/g, "$1:");
    }

    return prefix + "[" + className + " " + methodName + "]";
}


function throwUnrecognizedSelector(receiver, selector)
{
    throw new Error("Unrecognized selector: " + sel_getName(selector) + " sent to instance " + receiver);
}


function noConflict()
{
    root.nilscript = previousNilscript;
}


function makeCopy(object)
{
    if (isObject(object)) {
        return object.copy();

    } else if (Array.isArray(object)) {
        return object.slice(0);

    } else {
        var type = typeof object;
        
        if (!!object && (type == "object" || type == "function")) {
            return cloneJSObject(object);
        } else {
            return object;
        }
    }
}


function getClassList()
{
    var results = [ ];

    for (var key in _classSymbolToClassMap) { if (hop(_classSymbolToClassMap, key)) {
        results.push(_classSymbolToClassMap[key]);
    }}

    return results;
}


function isObject(object)
{
    return object instanceof NSObject;
}


function _getReadableForSymbol(inName)
{
    if (inName && inName.indexOf("N$_") == 0) {
        return inName.substr(5);
    }

    return inName;
}


function sel_getName(selector)
{
    return _getReadableForSymbol(selector);
}


function sel_isEqual(sel1, sel2)
{
    return sel1 == sel2;
}


function class_getName(cls)
{
    if (cls && cls[_nameKey]) {
        return _getReadableForSymbol(cls[_nameKey]);
    }

    return null;
}


function class_getSuperclass(cls)
{
    return Object.getPrototypeOf(cls);
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
    return !!cls.prototype[selector];
}


function msgSend(receiver, selector)
{
    return receiver ? (
        receiver[selector] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array.prototype.slice.call(arguments, 2)) : receiver;
}


var nilscript = {
    _id:                      0,
    _c:                       _classSymbolToClassMap,
    _g:                       { },
    _reset:                   _reset,

    noConflict:               noConflict,

    makeCopy:                 makeCopy,

    getClassList:             getClassList,
    getSuperclass:            class_getSuperclass,
    isObject:                 isObject,
    sel_getName:              sel_getName,
    sel_isEqual:              sel_isEqual,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_isSubclassOf:       class_isSubclassOf,
    class_respondsToSelector: class_respondsToSelector,
    object_getClass:          object_getClass,
    msgSend:                  msgSend
};


if (typeof module != "undefined" && typeof module != "function") {
    module.exports = nilscript;

    if (typeof global != "undefined" && typeof global != "function") {
        global[_globalKey] = nilscript;
    }

} else if (typeof define === "function" && define.amd) {
    define(nilscript);
} else {
    root.nilscript = root[_globalKey] = nilscript;
}

}).call(this || globalThis);
