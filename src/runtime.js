
var $oj = (function() {

var create = function(o) {
    function f() {}
    f.prototype = o;
    return new f();
};


function hop(obj, prop)
{
    return Object.prototype.hasOwnProperty.call(obj, prop);
}


function mixin(from, to)
{
    for (var key in from) { if (hop(from, key) && !hop(to, key)) {
        to[key] = from[key];
    }}
}


function makeClass(superClass, name, callback)
{
    var initializeClassMethod;
    var didCallInitialize = false;

    var ivars = { };

    var cls = function() {
        if (!didCallInitialize) {
            if (initializeClassMethod) {
                initializeClassMethod();
            }

            didCallInitialize = true;
        }
    };

    if (!superClass) superClass = BaseObject;
    cls.prototype = (Object.create || create)(superClass.prototype);

    cls.$oj_name = name;
    cls.$oj_isa  = superClass;
    mixin(superClass, cls);

    callback(cls, cls.prototype, ivars);

    initializeClassMethod = cls.initialize;

    if (Object.keys(ivars).length) {
        cls.$oj_default_ivars = ivars;
    }

    Object.freeze(cls);
    Object.freeze(cls.prototype);

    return cls;
}


function sel_getName(selector)
{
    var name = Object.keys && Object.keys(selector)[0];

    if (!name) {
        for (var key in selector) { if (selector.hasOwnProperty(key)) {
            return key;
        }}
    }

    return name;
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

}


function class_createInstance(cls)
{
    var instance = new cls();
    instance.$oj_isa = cls;

    var k = cls;

    while (k) {
        var ivars = k.$oj_default_ivars;

        if (ivars) {
            for (var key in ivars) { if (ivars.hasOwnProperty(key)) {
                instance[key] = ivars[key];
            }}
        };

        k = k.$oj_isa;
    } 

    Object.seal(instance);

    return instance;
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

BaseObject.alloc = function() { return class_createInstance(this); }
BaseObject.instancesRespondToSelector_ = function(aSelector) { return class_respondsToSelector(this, aSelector); }
BaseObject.prototype.init = function() { return this; }
BaseObject.prototype.mutableCopy = function() { return this; }
BaseObject.prototype.copy = function() { return this; }
BaseObject.prototype.performSelector_ = function(aSelector) { oj_msgSend(this, aSelector); }
BaseObject.prototype.performSelector_withObject_ = function(aSelector, object) { oj_msgSend(this, aSelector, object); }
BaseObject.prototype.performSelector_withObject_withObject_ = function(aSelector, o1, o2) { oj_msgSend(this, aSelector, o1, o2); }


return {
    makeClass:                makeClass,
    sel_getName:              sel_getName,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_createInstance:     class_createInstance,
    class_respondsToSelector: class_respondsToSelector,
    oj_msgSend:               oj_msgSend
}


}(this));
