/*
    runtime.js, runtime for the oj language
    by musictheory.net, LLC.

    Public Domain.
*/

;(function() { "use strict";

var root = this;
var previousOj = root.oj;

var BaseObject = function BaseObject() { }

var _classNameToReadyArrayMap = { };
var _classNameToSuperNameMap  = { };
var _classNameToClassMap      = { BaseObject: BaseObject };


function _reset()
{
    function clear(obj) {
        for (var key in obj) {
            obj[key] = undefined;
        }
    }

    clear(_classNameToReadyArrayMap);
    clear(_classNameToClassMap);
    clear(_classNameToSuperNameMap);

    _classNameToClassMap["BaseObject"] = BaseObject;
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


function _getDisplayName(className, methodName, prefix)
{
    if (className.indexOf("$oj$") != 0) {
        className = _getReadableForRawName(className);
    }

    if (methodName.indexOf("$oj$") != 0) {
        methodName = _getReadableForRawName(methodName);
        methodName = methodName.replace(/([A-Za-z0-9])_/g, "$1:");
    }

    return [ prefix, "[", className, " ", methodName, "]" ].join("");
}


function _callWhenClassReady(name, f)
{
    if (_classNameToClassMap[name]) {
        f();

    } else {
        var readyArray = _classNameToReadyArrayMap[name];
        
        if (readyArray) {
            readyArray.push(f);
        } else {
            _classNameToReadyArrayMap[name] = [ f ];
        }
    }
}


function throwUnrecognizedSelector(receiver, selector)
{
    throw new Error("Unrecognized selector: " + sel_getName(selector) + " sent to instance " + receiver);
}


function _registerCategory(classNameObject, callback)
{
    var className = _getRawName(classNameObject);

    _callWhenClassReady(className, function() {
        var cls = _classNameToClassMap[className];
        var instance_methods = { };
        var class_methods    = { };
        
        callback(class_methods, instance_methods);

        mixin(class_methods, cls, true, function(key, method) {
            method.displayName = _getDisplayName(className, key, "+");
        });

        mixin(instance_methods, cls.prototype, true, function(key, method) {
            method.displayName = _getDisplayName(className, key, "-");
        });
    });
}


function _registerClass(nameObject, superObject, callback)
{
    var isSubclassOfBase = false;

    if (!superObject) {
        superObject = { BaseObject: 1 };
        isSubclassOfBase = true;
    }

    var name = _getRawName(nameObject); 
    var superName = _getRawName(superObject);

    var cls;

    _classNameToSuperNameMap[name] = superName;

    _callWhenClassReady(superName, function() {
        var superclass = isSubclassOfBase ? BaseObject : _classNameToClassMap[superName];
        if (!superclass) return;     

        var instance_methods = { };
        var class_methods    = { };
        
        cls = callback(class_methods, instance_methods);

        cls.displayName  = name;
        cls["$oj_name"]  = name;
        cls["$oj_super"] = superclass;
        cls.prototype    = new superclass();

        mixin(superclass, cls);

        mixin(class_methods, cls, true, function(key, method) {
            method.displayName = _getDisplayName(name, key, "+");
        });

        mixin(instance_methods, cls.prototype, true, function(key, method) {
            method.displayName = _getDisplayName(name, key, "-");
        });

        _classNameToClassMap[name] = cls;

        var readyArray = _classNameToReadyArrayMap[name];
        if (readyArray) {
            for (var i = 0, length = readyArray.length; i < length; i++) {
                readyArray[i]();
            }
        }
    });
}


function noConflict()
{
    root.oj = previousOj;
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

    for (var key in _classNameToClassMap) { if (hop(_classNameToClassMap, key)) {
        results.push(_classNameToClassMap[key]);
    }}

    return results;
}


function getSubclassesOfClass(cls)
{
    if (!cls) return null;

    var results = [ ];
    var name = cls["$oj_name"];

    for (var key in _classNameToSuperNameMap) { if (hop(_classNameToSuperNameMap, key)) {
        var superName = _classNameToSuperNameMap[key];

        if (superName == name) {
            results.push(_classNameToClassMap[key]);
        }
    }}

    return results;
}


function isObject(object)
{
    return !!(object && object.constructor["$oj_name"]);
}


function _getRawName(selector)
{
    return selector && Object.keys && Object.keys(selector)[0];
}


function _getReadableForRawName(inName)
{
    if (inName.indexOf("$oj$") != 0) {
        return inName.substr(6);
    }

    return inName;
}


function sel_getName(selector)
{
    if (!selector) return null;
    var name = _getRawName(selector);
    if (name) name = name.substr(6);
    return name;
}


function sel_isEqual(sel1, sel2)
{
    return _getRawName(sel1) == _getRawName(sel2);
}


function class_getName(cls)
{
    if (cls && cls["$oj_name"]) {
        return _getReadableForRawName(cls["$oj_name"]);
    }

    return null;
}


function class_getSuperclass(cls)
{
    return cls["$oj_super"];
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
    return !!cls.prototype[_getRawName(selector)];
}


function msgSend(receiver, selector)
{
    return receiver ? (
        receiver[Object.keys(selector)[0]] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array.prototype.slice.call(arguments, 2)) : receiver;
}


var oj = {
    _id:                      0,
    _registerClass:           _registerClass,
    _registerCategory:        _registerCategory,
    _cls:                     _classNameToClassMap,
    _g:                       { },
    _reset:                   _reset,

    noConflict:               noConflict,

    makeCopy:                 makeCopy,

    getClassList:             getClassList,
    getSubclassesOfClass:     getSubclassesOfClass,
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
BaseObject.respondsToSelector_ = function(aSelector) { return !!this[_getRawName(aSelector)]; }
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
BaseObject.prototype.description = function() { return "<" + this.className() + " " + this["$oj_id"] + ">" }
BaseObject.prototype.toString = function() { return this.description(); }
BaseObject.prototype.isKindOfClass_ = function(cls) { return class_isSubclassOf(object_getClass(this), cls); }
BaseObject.prototype.isMemberOfClass_ = function(cls) { return object_getClass(this) === cls; }
BaseObject.prototype.isEqual_ = function(other) { return this === other; }

if (typeof module != "undefined" && typeof module != "function") {
    module.exports = oj;

    if (typeof global != "undefined" && typeof global != "function") {
        global["$oj_oj"] = oj;
    }

} else if (typeof define === "function" && define.amd) {
    define(oj);
} else {
    root.oj = root["$oj_oj"] = oj;
}

}).call(this);
