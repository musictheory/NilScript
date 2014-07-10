/*
    compiler.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima     = require("esprima-oj");
var OJError     = require("./errors").OJError;
var Utils       = require("./utils");
var Syntax      = esprima.Syntax;
var _           = require("lodash");


var OJDynamicProperty = " OJDynamicProperty ";



function OJIvar(name, type)
{
    this.name        = name;
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


function OJMethod(selectorName, selectorType, returnType, parameterTypes)
{
    this.selectorName   = selectorName;
    this.selectorType   = selectorType;
    this.returnType     = returnType;
    this.parameterTypes = parameterTypes;
    this.synthesized    = false;
}


function sMakeOJMethodForNode(node)
{
    var selectorName    = node.selectorName;
    var selectorType    = node.selectorType;
    var methodSelectors = node.methodSelectors;

    var parameterTypes = [ ];

    var methodType;
    for (var i = 0, length = (methodSelectors.length || 0); i < length; i++) {
        methodType = methodSelectors[i].methodType;
        if (methodType) {
            parameterTypes.push(methodType.value);
        } else if (methodSelectors[i].variableName) {
            parameterTypes.push("id");
        }
    }

    var returnType;
    if (node.returnType) returnType = node.returnType.value;
    if (!returnType) returnType = "id";

    return new OJMethod(selectorName, selectorType, returnType, parameterTypes);
}


function OJProtocol(name)
{
    this.name = name;

    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


OJProtocol.prototype.registerMethodDeclaration = function(node)
{
    var selectorName = node.selectorName;
    var map = (node.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(node, OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = sMakeOJMethodForNode(node);
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

    this._ivarMap           = { };
    this._propertyMap       = { };
    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


OJClass.prototype.loadState = function(state)
{
    this.name = state.name;
    this.superclassName = state.superclassName;

    _.each(state.ivars, function(i) {
        this._ivarMap[i.name] = new OJIvar(i.name, i.type);
    });

    _.each(state.properties, function(p) {
        this._propertyMap[p.name] = new OJProperty(p.name, p.type, p.writable, p.getter, p.setter, p.ivar);
    });

    _.each(state.classMethods, function(m) {
        this._classMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes);
    });

    _.each(state.instanceMethods, function(m) {
        this._instanceMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes);
    });
}


OJClass.prototype.saveState = function()
{
    return {
        name:            this.name,
        superclassName:  this.superclassName,
        ivars:           _.values(this._ivarMap),
        properties:      _.values(this._propertyMap),
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap)
    }
}


OJClass.prototype.registerIvarDeclaration = function(node)
{
    var type = node.parameterType ? node.parameterType.value : null;

    for (var i = 0, length = node.ivars.length; i < length; i++) {
        var name = node.ivars[i].name;
        this._ivarMap[name] = new OJIvar(name, type);
    }
}


OJClass.prototype.registerAtProperty = function(node)
{
    var name = node.id.name;

    if (this._propertyMap[name]) {
        Utils.throwError(node, OJError.DuplicatePropertyDefinition, "Property " + name + " has previous declaration");
    }

    var type     = node.parameterType ? node.parameterType.value : "id";
    var writable = true;
    var getter   = name;
    var setter   = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + ":";

    for (var i = 0, length = node.attributes.length; i < length; i++) {
        var attribute = node.attributes[i];
        var attributeName = attribute.name;

        if (attributeName == "readonly") {
            writable = false;
        } else if (attribute.name == "readwrite") {
            writable = true;
        } else if (attributeName == "getter") {
            getter = attribute.selector.selectorName;
        } else if (attributeName == "setter") {
            setter = attribute.selector.selectorName;
        }
    }

    if (!writable) {
        setter = null;
    }

    this._propertyMap[name] = new OJProperty(name, type, writable, getter, setter, null);
}


OJClass.prototype.registerAtSynthesize = function(node)
{
    var pairs = node.pairs;

    for (var i = 0, length = pairs.length; i < length; i++) {
        var pair = pairs[i];
        var name = pair.id.name;
        var backing = pair.backing ? pair.backing.name : name;

        var property = this._propertyMap[name];
        if (!property) {
            Utils.throwError(node, OJError.UnknownProperty, "Unknown property: " + name);
        } else if (property.ivar == OJDynamicProperty) {
            Utils.throwError(node, OJError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
        } else if (property.ivar) {
            Utils.throwError(node, OJError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
        }

        property.ivar = backing;
    }
}


OJClass.prototype.registerAtDynamic = function(node)
{
    var ids = node.ids;

    for (var i = 0, length = ids.length; i < length; i++) {
        var id = ids[i];
        var name = id.name;

        var property = this._propertyMap[name];
        if (!property) {
            Utils.throwError(node, OJError.UnknownProperty, "Unknown property: " + name);
        } else if (property.ivar == OJDynamicProperty) {
            Utils.throwError(node, OJError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
        } else if (property.ivar) {
            Utils.throwError(node, OJError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
        }

        property.ivar   = OJDynamicProperty;
        property.setter = null;
        property.getter = null;
    }
}


OJClass.prototype.registerMethodDefinition = function(node)
{
    var selectorName = node.selectorName;
    var map = (node.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(node, OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = sMakeOJMethodForNode(node);
}


OJClass.prototype.doAutomaticSynthesis = function()
{
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
            Utils.throwError(null, OJError.InstanceVariableAlreadyClaimed, "Synthesized properties '" +  backingIvarToPropertyNameMap[ivarName] + "' and '" + name + "' both claim instance variable '" + ivarName + "'");
        } else {
            backingIvarToPropertyNameMap[ivarName] = name;
        }

        // Generate backing ivar
        if (needsBackingIvar) {
            ivar = new OJIvar(ivarName, property.type);
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
    OJClass:    OJClass,
    OJProtocol: OJProtocol,
    OJProperty: OJProperty,
    OJMethod:   OJMethod,
    OJIvar:     OJIvar
};
