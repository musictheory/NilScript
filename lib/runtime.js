/*
    runtime.js, runtime for the NilScript language
    by musictheory.net, LLC.

    Public Domain.
*/

;(function() { "use strict";

var root = this;
var previousNilscript = root.nilscript;

var _nameKey      = "N$_name";
var _superKey     = "N$_super";
var _baseClassKey = "N$_base";
var _globalKey    = "N$$_";

var BaseObject = function BaseObject() { }

var _classSymbolToReadyArrayMap  = { };
var _classSymbolToClassMap       = { "N$_base": BaseObject };


function _reset()
{
    function clear(obj) {
        for (var key in obj) {
            obj[key] = undefined;
        }
    }

    clear(_classSymbolToReadyArrayMap);
    clear(_classSymbolToClassMap);

    _classSymbolToClassMap[_baseClassKey] = BaseObject;
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


function mixin(from, to, overwrite, callback)
{
    for (var key in from) { if (hop(from, key) && (overwrite || !hop(to, key))) {
        var value = from[key];
        if (callback) callback(key, value);
        to[key] = value;
    }}
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


function _callWhenClassReady(name, f)
{
    if (_classSymbolToClassMap[name]) {
        f();

    } else {
        var readyArray = _classSymbolToReadyArrayMap[name];
        
        if (readyArray) {
            readyArray.push(f);
        } else {
            _classSymbolToReadyArrayMap[name] = [ f ];
        }
    }
}


function throwUnrecognizedSelector(receiver, selector)
{
    throw new Error("Unrecognized selector: " + sel_getName(selector) + " sent to instance " + receiver);
}


function _registerClass(classSymbol, superSymbol, callback)
{
    var isSubclassOfBase = false;

    if (!superSymbol) {
        superSymbol = _baseClassKey;
        isSubclassOfBase = true;
    }

    var cls;

    _callWhenClassReady(superSymbol, function() {
        var superclass = isSubclassOfBase ? BaseObject : _classSymbolToClassMap[superSymbol];
        if (!superclass) return;     

        var instance_methods = { };
        var class_methods    = { };
        
        cls = callback(class_methods, instance_methods);

        cls.displayName = _getReadableForSymbol(classSymbol);
        cls[_nameKey]   = classSymbol;
        cls[_superKey]  = superclass;
        cls.prototype   = new superclass();

        mixin(superclass, cls);

        mixin(class_methods, cls, true, function(key, method) {
            method.displayName = _getMethodDisplayName(classSymbol, key, "+");
        });

        mixin(instance_methods, cls.prototype, true, function(key, method) {
            method.displayName = _getMethodDisplayName(classSymbol, key, "-");
        });

        _classSymbolToClassMap[classSymbol] = cls;

        var readyArray = _classSymbolToReadyArrayMap[classSymbol];
        if (readyArray) {
            for (var i = 0, length = readyArray.length; i < length; i++) {
                readyArray[i]();
            }
        }
    });
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
    return !!(object && object.constructor[_nameKey]);
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
    return cls[_superKey];
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
    _registerClass:           _registerClass,
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


BaseObject.alloc = function() { return new this(); }
BaseObject["class"] = function() { return this; }
BaseObject.superclass = function() { return class_getSuperclass(this); }
BaseObject.className = function() { return class_getName(this); }
BaseObject.respondsToSelector_ = function(aSelector) { return !!this[aSelector]; }
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
BaseObject.prototype.performSelector_ = function(aSelector) { return msgSend(this, aSelector); }
BaseObject.prototype.performSelector_withObject_ = function(aSelector, object) { return msgSend(this, aSelector, object); }
BaseObject.prototype.performSelector_withObject_withObject_ = function(aSelector, o1, o2) { return msgSend(this, aSelector, o1, o2); }
BaseObject.prototype.description = function() { return "<" + this.className() + " " + this["N$_id"] + ">" }
BaseObject.prototype.toString = function() { return this.description(); }
BaseObject.prototype.isKindOfClass_ = function(cls) { return class_isSubclassOf(object_getClass(this), cls); }
BaseObject.prototype.isMemberOfClass_ = function(cls) { return object_getClass(this) === cls; }
BaseObject.prototype.isEqual_ = function(other) { return this === other; }

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

}).call(this);
