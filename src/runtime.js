
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


function oj_msgSend(target, selector)
{
    if (target == null) return null;

    var name = sel_getName(selector);
    var imp  = target[name];
    if (!imp) throw new Error("Undefined selector: " + name);

    return imp.apply(target, Array.prototype.slice.call(arguments, 2));
}


function BaseObject() { }

BaseObject.alloc = function() { return new this(); }
BaseObject.class = function() { return this; }
BaseObject.className = function() { return class_getName(this); }
BaseObject.instancesRespondToSelector_ = function(aSelector) { return class_respondsToSelector(this, aSelector); }
BaseObject.prototype.init = function() { return this; }
BaseObject.prototype.mutableCopy = function() { return this; }
BaseObject.prototype.copy = function() { return this; }
BaseObject.prototype.superclass = function() { return class_getSuperclass(object_getClass(this)); }
BaseObject.prototype.class = function() { return object_getClass(this); }
BaseObject.prototype.className = function() { return class_getName(object_getClass(this)); }
BaseObject.prototype.respondsToSelector_ = function(aSelector) { return class_respondsToSelector(object_getClass(this), aSelector); }
BaseObject.prototype.performSelector_ = function(aSelector) { oj_msgSend(this, aSelector); }
BaseObject.prototype.performSelector_withObject_ = function(aSelector, object) { oj_msgSend(this, aSelector, object); }
BaseObject.prototype.performSelector_withObject_withObject_ = function(aSelector, o1, o2) { oj_msgSend(this, aSelector, o1, o2); }
BaseObject.prototype.description = function() { return "<" + this.className() + " " + this.$oj_id + ">" }
BaseObject.prototype.toString = function() { return this.description(); }



return {
    makeClass:                makeClass,
    sel_getName:              sel_getName,
    sel_isEqual:              sel_isEqual,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_isSubclassOf:       class_isSubclassOf,
    class_respondsToSelector: class_respondsToSelector,
    object_getClass:          object_getClass,
    oj_msgSend:               oj_msgSend
}


}(this));
