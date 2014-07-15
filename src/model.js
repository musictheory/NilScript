/*
    model.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var OJError     = require("./errors").OJError;
var Utils       = require("./utils");
var _           = require("lodash");


var OJDynamicProperty = " OJDynamicProperty ";


function OJEnum(name, unsigned, values)
{
    this.name     = name;
    this.unsigned = unsigned;
    this.values   = values || { };
}


OJEnum.prototype.addValue = function(name, value)
{
    this.values[name] = value;
}


function OJIvar(name, className, type)
{
    this.name        = name;
    this.className   = className;
    this.type        = type;
    this.synthesized = false;
}


function OJProperty(name, type, writable, getter, setter, ivar)
{
    this.name        = name;
    this.type        = type;
    this.writable    = writable;
    this.getter      = getter;
    this.setter      = setter;
    this.ivar        = ivar;
}


function OJMethod(selectorName, selectorType, returnType, parameterTypes, variableNames, usesSelf)
{
    this.selectorName   = selectorName;
    this.selectorType   = selectorType;
    this.returnType     = returnType;
    this.parameterTypes = parameterTypes || [ ];
    this.variableNames  = variableNames  || [ ];
    this.usesSelf       = !!usesSelf;
    this.synthesized    = false;
}


function OJModel()
{
    this.enums     = [ ];
    this.consts    = { };
    this.classes   = { };
    this.protocols = { };
    this.selectors = { };

    this._squeezerId      = 0;
    this._squeezerToMap   = { };
    this._squeezerFromMap = { };
}




// function Squeezer(state, options)
// {
//     if (!state) state = { };

//     this._toMap   = state["to"]      || { };
//     this._fromMap = state["from"]    || { };
//     this._id      = state["id"]      || 0;

//     if (options.start && !this._id) {
//         this._id = options.start;
//     }

// }


var sBase52Digits = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";

function sToBase52(index)
{
    var result = "";
    var base = 52;

    do {
        result += sBase52Digits.charAt(index % base);
        index = Math.floor(index / base);
        base = 62;
    } while (index > 0);

    return result;
}


OJModel.prototype.setupSqueezer = function(start, max)
{

}


OJModel.prototype.getSqueezedName = function(oldName, add)
{
    var fromMap = this._squeezerFromMap;
    var toMap   = this._squeezerToMap;

    var newName = toMap[oldName];
    var hasName = toMap.hasOwnProperty(oldName)

    if (!hasName && add) {
        while (!newName) {
            var nameToTry = "$oj$" + sToBase52(this._squeezerId);
            if (!fromMap[nameToTry]) {
                newName = nameToTry;
            }

            this._squeezerId++;
        }

        toMap[oldName]   = newName;
        fromMap[newName] = oldName;
        hasName          = true;
    }

    return hasName ? newName : undefined;
}


OJModel.prototype.loadState = function(state)
{
    var enums     = this.enums;
    var classes   = this.classes;
    var protocols = this.protocols;

    _.each(state.enums, function(e) {
        enums.push(new OJEnum(e.name, e.unsigned, e.values));
    });

    _.extend(this.consts, state.consts);

    _.each(state.classes, function(c) {
        var cls = new OJClass();
        cls.loadState(c);
        classes[cls.name] = cls;
    });

    _.each(state.protocols, function(p) {
        var protocol = new OJProtocol();
        protocol.loadState(p);
        protocols[protocol.name] = protocol;
    });
}



OJModel.prototype.saveState = function()
{
    return {
        squeezer: {
            from: this._squeezerFromMap,
            to:   this._squeezerToMap,
            id:   this._squeezerId
        },

        consts:    this.consts,
        enums:     this.enums,
        selectors: this.selectors,

        classes: _.map(this.classes, function(c) {
            return c.saveState();
        }),

        protocols: _.map(this.protocols, function(p) {
            return p.saveState();
        })
    }
}


OJModel.prototype.prepare = function()
{
    var selectors = { };

    _.each(this.classes, function(cls, name) {
        var i, length;

        cls.doAutomaticSynthesis();

        methods = cls.getInstanceMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }

        methods = cls.getClassMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }
    });

    _.each(this._nameToProtocolMap, function(protocol, name) {
        var i, length;

        methods = protocol.getInstanceMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }

        methods = protocol.getClassMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }
    });

    var baseObjectSelectors = Utils.getBaseObjectSelectorNames();
    for (var i = 0, length = baseObjectSelectors.length; i < length; i++) {
        selectors[baseObjectSelectors[i]] = true;
    }

    this.selectors = selectors;
}


OJModel.prototype.addConst = function(name, value)
{
    this.consts[name] = value;
}


OJModel.prototype.addEnum = function(e)
{
    this.enums.push(e);
}


OJModel.prototype.addClass = function(cls)
{
    var name = cls.name;
    var existing = this.classes[name];

    if (existing) {
        if (existing.forward && !cls.forward) {
            this.classes[name] = cls;
        } else if (!existing.forward && !cls.forward) {
            Utils.throwError(OJError.DuplicateClassDefinition, "Duplicate declaration of class '" + name +"'");
        }

    } else {
        this.classes[name] = cls;
    } 
}


OJModel.prototype.addProtocol = function(protocol)
{
    var name = protocol.name;

    if (this.protocols[name]) {
        Utils.throwError(OJError.DuplicateProtocolDefinition, "Duplicate declaration of protocol '" + name +"'");
    }

    this.protocols[name] = protocol;
}




function OJProtocol(name)
{
    this.name = name;

    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


OJProtocol.prototype.loadState = function(state)
{
    var classMethodMap    =  this._classMethodMap;
    var instanceMethodMap =  this._instanceMethodMap;

    this.name = state.name;

    _.each(state.classMethods, function(m) {
        classMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.usesSelf);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.usesSelf);
    });
}


OJProtocol.prototype.addMethod = function(method)
{
    var selectorName = method.selectorName;
    var map = (method.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


OJProtocol.prototype.saveState = function()
{
    return {
        name:            this.name,
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap)
    }
}


OJProtocol.prototype.getClassMethods = function()
{
    return _.values(this._classMethodMap);
}


OJProtocol.prototype.getInstanceMethods = function()
{
    return _.values(this._instanceMethodMap);
}


function OJClass(name, superclassName)
{
    this.name           = name;
    this.superclassName = superclassName;
    this.forward        = false;

    this._ivarMap           = { };
    this._propertyMap       = { };
    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


OJClass.prototype.loadState = function(state)
{
    this.name           = state.name;
    this.superclassName = state.superclassName;
    this.forward        = state.forward; 
    this.didSynthesis   = state.didSynthesis;

    var ivarMap           =  this._ivarMap;
    var propertyMap       =  this._propertyMap;
    var classMethodMap    =  this._classMethodMap;
    var instanceMethodMap =  this._instanceMethodMap;

    _.each(state.ivars, function(i) {
        ivarMap[i.name] = new OJIvar(i.name, i.className, i.type);
    });

    _.each(state.properties, function(p) {
        propertyMap[p.name] = new OJProperty(p.name, p.type, p.writable, p.getter, p.setter, p.ivar);
    });

    _.each(state.classMethods, function(m) {
        classMethodMap[m.selectorName] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.usesSelf);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.selectorName] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.usesSelf);
    });
}


OJClass.prototype.saveState = function()
{
    return {
        name:            this.name,
        superclassName:  this.superclassName,
        didSynthesis:  !!this.didSynthesis,
        forward:         this.forward,

        ivars:           _.values(this._ivarMap),
        properties:      _.values(this._propertyMap),
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap)
    }
}




OJClass.prototype.doAutomaticSynthesis = function()
{
    if (this.didSynthesis) {
        return;
    }

    var properties = _.values(this._propertyMap);
    var backingIvarToPropertyNameMap = { };

    for (var i = 0, length = properties.length; i < length; i++) {
        var property = properties[i];

        var name     = property.name;
        var ivarName = property.ivar;

        if (ivarName == OJDynamicProperty) return;

        if (!ivarName) {
            property.ivar = ivarName = "_" + name;
        }

        var getter = property.getter;
        var setter = property.setter;

        var ivar         = ivarName ? this._ivarMap[ivarName]         : null;
        var getterMethod = getter   ? this._instanceMethodMap[getter] : null;
        var setterMethod = setter   ? this._instanceMethodMap[setter] : null;

        var needsBackingIvar = (ivarName && !ivar);
        if (property.writable && getterMethod && setterMethod) {
            needsBackingIvar = false;
        } else if (!property.writable && getterMethod) {
            needsBackingIvar = false;
        }

        if (backingIvarToPropertyNameMap[ivarName]) {
            Utils.throwError(OJError.InstanceVariableAlreadyClaimed, "Synthesized properties '" +  backingIvarToPropertyNameMap[ivarName] + "' and '" + name + "' both claim instance variable '" + ivarName + "'");
        } else {
            backingIvarToPropertyNameMap[ivarName] = name;
        }

        // Generate backing ivar
        if (needsBackingIvar) {
            ivar = new OJIvar(ivarName, this.name, property.type);
            ivar.synthesized = true;
            this._ivarMap[ivarName] = ivar;
        }

        if (getter && !getterMethod) {
            getterMethod = new OJMethod(getter, "-", property.type, [ ]);
            getterMethod.synthesized = true;
            this._instanceMethodMap[getter] = getterMethod;
        }

        if (setter && !setterMethod) {
            setterMethod = new OJMethod(setter, "-", "void", [ property.type ]);
            setterMethod.synthesized = true;
            this._instanceMethodMap[setter] = setterMethod;
        }
    }

    this.didSynthesis = true;
}


OJClass.prototype.isIvar = function(ivar)
{
    return !!this._ivarMap[ivar];
}


OJClass.prototype.getIvarNameForPropertyName = function(propertyName)
{
    var property = this._propertyMap[propertyName];
    if (!propertyName) return null;

    if (property.ivar == OJDynamicProperty) {
        return null;
    }

    return property.ivar;
}


OJClass.prototype.shouldSynthesizeIvarForPropertyName = function(propertyName)
{
    var property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    var hasGetter = property.getter ? this.hasInstanceMethod(property.getter) : false;
    var hasSetter = property.setter ? this.hasInstanceMethod(property.setter) : false;

    // If property is readwrite and both a getter and setter are manually defined
    if (property.writable && hasGetter && hasSetter) {
        return false;
    }

    // If property is readonly and a getter is manually defined
    if (!property.writable && hasGetter) {
        return false;
    }

    return true;
}


OJClass.prototype.shouldGenerateGetterImplementationForPropertyName = function(propertyName)
{
    var property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    if (property.getter) {
        var method = this._instanceMethodMap[property.getter];
        return method && method.synthesized;
    }

    return false;
}


OJClass.prototype.shouldGenerateSetterImplementationForPropertyName = function(propertyName)
{
    var property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    if (property.setter) {
        var method = this._instanceMethodMap[property.setter];
        return method && method.synthesized;
    }

    return false;
}


OJClass.prototype.addIvar = function(ivar)
{
    var name = ivar.name;

    if (this._ivarMap[name]) {
        Utils.throwError(OJError.DuplicateIvarDefinition, "Instance variable " + name + " has previous declaration");
    }

    this._ivarMap[name] = ivar;    
}


OJClass.prototype.addProperty = function(property)
{
    var name = property.name;

    if (this._propertyMap[name]) {
        Utils.throwError(OJError.DuplicatePropertyDefinition, "Property " + name + " has previous declaration");
    }

    this._propertyMap[name] = property;
}


OJClass.prototype.makePropertySynthesized = function(name, backing)
{
    var property = this._propertyMap[name];
    if (!property) {
        Utils.throwError(OJError.UnknownProperty, "Unknown property: " + name);
    } else if (property.ivar == OJDynamicProperty) {
        Utils.throwError(OJError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
    } else if (property.ivar) {
        Utils.throwError(OJError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
    }

    property.ivar = backing;
}


OJClass.prototype.makePropertyDynamic = function(name)
{
    var property = this._propertyMap[name];
    if (!property) {
        Utils.throwError(OJError.UnknownProperty, "Unknown property: " + name);
    } else if (property.ivar == OJDynamicProperty) {
        Utils.throwError(OJError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
    } else if (property.ivar) {
        Utils.throwError(OJError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
    }

    property.ivar   = OJDynamicProperty;
    property.setter = null;
    property.getter = null;
}


OJClass.prototype.addMethod = function(method)
{
    var selectorName = method.selectorName;
    var map = (method.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


OJClass.prototype.getAllIvars = function()
{
    return _.values(this._ivarMap);
}


OJClass.prototype.getClassMethods = function()
{
    return _.values(this._classMethodMap);
}


OJClass.prototype.getInstanceMethods = function()
{
    return _.values(this._instanceMethodMap);
}


OJClass.prototype.getInstanceMethodWithName = function(selectorName)
{
    return this._instanceMethodMap[selectorName];
}


OJClass.prototype.getClassMethodWithName = function(selectorName)
{
    return this._classMethodMap[selectorName];
}


OJClass.prototype.getPropertyWithName = function(propertyName)
{
    return this._propertyMap[propertyName];
}


module.exports = {
    OJModel:    OJModel,
    OJClass:    OJClass,
    OJProtocol: OJProtocol,
    OJProperty: OJProperty,
    OJMethod:   OJMethod,
    OJIvar:     OJIvar,
    OJEnum:     OJEnum
};
