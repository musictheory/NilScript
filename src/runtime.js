
var $oj = (function() {

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

    cls.$oj_name = name;
    cls.prototype.$oj_super = superClass;

    callback(cls, cls.prototype, ivars);

    initializeClassMethod = cls.initialize;
    loadFunction = cls.load;

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
    var k = cls;

    while (k) {
        var ivars = k.$oj_default_ivars;

        if (ivars) {
            for (var key in ivars) { if (ivars.hasOwnProperty(key)) {
                instance[key] = ivars[key];
            }}
        };

        k = k.$oj_super;
    } 

    Object.freeze(instance);

    return instance;
}


function class_respondsToSelector(cls, selector)
{
    return !!cls.prototype[sel_getName(selector)];
}


function msgSend(target, selector)
{
    if (!target) return target;

    var name = sel_getName(selector);
    var imp  = target[name];
    if (!imp) throw new Error("Undefined selector: " + name);

    return imp.apply(target, Array.prototype.slice.call(arguments, 2));
}

return {
    makeClass:                makeClass,
    sel_getName:              sel_getName,
    class_getName:            class_getName,
    class_getSuperclass:      class_getSuperclass,
    class_createInstance:     class_createInstance,
    class_respondsToSelector: class_respondsToSelector,
    msgSend:                  msgSend
}


}(this));
