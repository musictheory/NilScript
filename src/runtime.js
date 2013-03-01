
var $oj = (function() {

var sIDCounter = 0;

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


function makeClass(superClass, name, callback)
{
    var initializeClassMethod;
    var didCallInitialize = false;

    var cls = function() {
        if (!didCallInitialize) {
            if (initializeClassMethod) {
                initializeClassMethod();
            }

            didCallInitialize = true;
        }

        this.$oj_isa = cls;
        this.$oj_id  = sIDCounter++;
        mixin(cls.$oj_default_ivars, this);

        if (Object.seal) Object.seal(this);

        return this;
    };

    if (!superClass) superClass = BaseObject;
    cls.prototype   = (Object.create || create)(superClass.prototype);
    cls.displayName = sel_getName(name);

    cls.$oj_super = superClass;
    cls.$oj_name  = name;

    mixin(superClass, cls);

    var instance_methods = { };
    var class_methods    = { };
    var ivars            = { };
    var key;

    callback(class_methods, instance_methods, ivars);

    mixin(class_methods, cls, function(key, method) {
        method.displayName = getDisplayName(cls.displayName, key, "+");
    });

    mixin(instance_methods, cls.prototype, function(key, method) {
        method.displayName = getDisplayName(cls.displayName, key, "-");
    });

    initializeClassMethod = cls.initialize;

    var k = superClass;
    while (k) {
        if (k.$oj_default_ivars) {
            mixin(k.$oj_default_ivars, ivars);
        }

        k = k.$oj_super;
    } 

    cls.$oj_default_ivars = ivars;

    return cls;
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
    return object.$oj_isa;
}


function class_respondsToSelector(cls, selector)
{
    return !!cls.prototype[sel_getName(selector)];
}


var Array_prototype_slice = Array.prototype.slice;

function oj_msgSend(receiver, selector)
{
    return receiver ? (
        receiver[sel_getName(selector)] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array_prototype_slice.call(arguments, 2)) : receiver;
}


function oj_msgSend_Object_keys(receiver, selector)
{
    return receiver ? (
        receiver[Object.keys(selector)[0]] ||
        throwUnrecognizedSelector(receiver, selector)
    ).apply(receiver, Array_prototype_slice.call(arguments, 2)) : receiver;
}


function BaseObject() { }

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
BaseObject.prototype.performSelector_ = function(aSelector) { return oj_msgSend(this, aSelector); }
BaseObject.prototype.performSelector_withObject_ = function(aSelector, object) { return oj_msgSend(this, aSelector, object); }
BaseObject.prototype.performSelector_withObject_withObject_ = function(aSelector, o1, o2) { return oj_msgSend(this, aSelector, o1, o2); }
BaseObject.prototype.description = function() { return "<" + this.className() + " " + this.$oj_id + ">" }
BaseObject.prototype.toString = function() { return this.description(); }
BaseObject.prototype.isKindOfClass_ = function(cls) { return class_isSubclassOf(object_getClass(this), cls); }
BaseObject.prototype.isMemberOfClass_ = function(cls) { return object_getClass(this) === cls; }
BaseObject.prototype.isEqual_ = function(other) { return this === other; }

return {
    makeClass:                makeClass,
    sel_getName:              sel_getName,
    sel_isEqual:              sel_isEqual,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_isSubclassOf:       class_isSubclassOf,
    class_respondsToSelector: class_respondsToSelector,
    object_getClass:          object_getClass,
    oj_msgSend:               Object.keys ? oj_msgSend_Object_keys : oj_msgSend
}


}(this));
