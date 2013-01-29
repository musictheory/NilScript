
function $oj_class(superClass, callback)
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

    cls.prototype.$oj_super = superClass;

    callback(cls, cls.prototype, ivars);

    initializeClassMethod = cls.initialize;
    loadFunction = cls.load;

    if (Object.keys(ivars).length) {
        cls.$oj_ivars = ivars;
    }

    Object.freeze(cls);
    Object.freeze(cls.prototype);

    return cls;
}


var $oj_msgSend;

var $oj_class_createInstance = function(cls)
{
    var instance = new cls();
    var k = cls;

    while (k) {
        var ivars = k.$oj_ivars;

        if (ivars) {
            for (var key in ivars) { if (ivars.hasOwnProperty(key)) {
                instance[key] = ivars[key];
            }}
        };

        k = k.$oj_super;
    } 

    Object.seal(instance);

    return instance;
}


if (Object.keys) {
    $oj_msgSend = function(target, selector) {
        if (!target) return target;

        var name = Object.keys(selector)[0];
        var imp = target[name];
        if (!imp) throw new Error("Undefined selector: " + name);

        return imp.apply(target, Array.prototype.slice.call(arguments, 2));
    };

} else {
    $oj_msgSend = function(target, selector) {
        if (!target) return target;

        for (var key in selector) { if (selector.hasOwnProperty(key)) {
            var imp = target[key];
            if (!imp) throw new Error("Undefined selector: " + key);

            return imp.apply(target, Array.prototype.slice.call(arguments, 2));
        }}
    };
}


