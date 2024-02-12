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
static superclass() { return Object.getPrototypeOf(this); }
static className() { return class_getName(this); }
static respondsToSelector_(aSelector) { return !!this[aSelector]; }

init() { return this; }
class() { return this.constructor; }
className() { return class_getName(this.constructor); }
respondsToSelector_(aSelector) { return !!this[aSelector]; }
toString() { return "<" + this.className() + " " + this["N$_id"] + ">" }

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


function noConflict()
{
    root.nilscript = previousNilscript;
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


function class_getName(cls)
{
    if (cls && cls[_nameKey]) {
        return _getReadableForSymbol(cls[_nameKey]);
    }

    return null;
}


var nilscript = {
    _id:        0,
    _c:         _classSymbolToClassMap,
    _g:         { },
    _reset:     _reset,
    noConflict: noConflict,
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
