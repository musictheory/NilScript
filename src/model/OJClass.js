/*
    OJClass.js
    Model class for an oj class @implementation
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _           = require("lodash");
const OJError     = require("../errors").OJError;
const Utils       = require("../utils");
const OJIvar      = require("./OJIvar");
const OJProperty  = require("./OJProperty");
const OJMethod    = require("./OJMethod");


const OJDynamicProperty = " OJDynamicProperty ";


module.exports = class OJClass {


constructor(name, superclassName, protocolNames)
{
    this.name           = name;
    this.superclassName = superclassName;
    this.protocolNames  = protocolNames || [ ];
    
    // For @class
    this.forward = false;

    // For category definitions that appear before @implementation
    this.placeholder = false;

    // { path: ..., line: ...} pair for error messages, *not archived*
    this.pathLine = null;

    // Is this class in the current compilation unit?  *not archived*
    this.local = true;

    this._ivarMap           = { };
    this._propertyMap       = { };
    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


loadState(state)
{
    this.name           = state.name;
    this.superclassName = state.superclassName;
    this.protocolNames  = state.protocolNames || [ ];
    this.forward        = state.forward; 
    this.placeholder    = state.placeholder;
    this.didSynthesis   = state.didSynthesis;

    let ivarMap           =  this._ivarMap;
    let propertyMap       =  this._propertyMap;
    let classMethodMap    =  this._classMethodMap;
    let instanceMethodMap =  this._instanceMethodMap;

    _.each(state.ivars, function(i) {
        ivarMap[i.name] = new OJIvar(i.name, i.className, i.type);
    });

    _.each(state.properties, function(p) {
        propertyMap[p.name] = new OJProperty(p.name, p.type, p.writable, p.getter, p.setter, p.ivar, false);
    });

    _.each(state.classMethods, function(m) {
        classMethodMap[m.selectorName] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, false);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.selectorName] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, false);
    });
}


saveState()
{
    return {
        name:            this.name,
        superclassName:  this.superclassName,
        protocolNames:   this.protocolNames,
        didSynthesis:  !!this.didSynthesis,
        forward:         this.forward,
        placeholder:     this.placeholder,

        ivars:           _.values(this._ivarMap),
        properties:      _.values(this._propertyMap),
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap)
    }
}


doAutomaticSynthesis()
{
    if (this.didSynthesis) {
        return;
    }

    let properties = _.values(this._propertyMap);
    let backingIvarToPropertyNameMap = { };

    for (let i = 0, length = properties.length; i < length; i++) {
        let property = properties[i];

        let name     = property.name;
        let ivarName = property.ivar;
        let getter   = property.getter;
        let setter   = property.setter;

        if (ivarName == OJDynamicProperty) continue;

        let hadExplicitlySynthesizedIvarName = !!ivarName;

        if (!ivarName) {
            ivarName = "_" + name;
            property.ivar = ivarName;
        }

        let ivar         = ivarName ? this._ivarMap[ivarName]         : null;
        let getterMethod = getter   ? this._instanceMethodMap[getter] : null;
        let setterMethod = setter   ? this._instanceMethodMap[setter] : null;

        let generateBackingIvar = !ivar;

        // If backing is nil, there was no explicit @synthesize, and we should only make the
        // backing ivar unless: 
        //
        // 1) readwrite property and both -setFoo: and -foo are defined
        //    or
        // 2) readonly property and -foo is defined
        //
        if (!hadExplicitlySynthesizedIvarName) {
            if (property.writable && getterMethod && setterMethod) {
                generateBackingIvar = false;
            } else if (!property.writable && getterMethod) {
                generateBackingIvar = false;
            }
        }

        if (backingIvarToPropertyNameMap[ivarName]) {
            Utils.throwError(OJError.InstanceVariableAlreadyClaimed, "Synthesized properties '" +  backingIvarToPropertyNameMap[ivarName] + "' and '" + name + "' both claim instance variable '" + ivarName + "'");
        } else {
            backingIvarToPropertyNameMap[ivarName] = name;
        }

        // Generate backing ivar
        if (generateBackingIvar) {
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


isIvar(ivarName)
{
    return !!this._ivarMap[ivarName];
}


getIvarNameForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!propertyName) return null;

    if (property.ivar == OJDynamicProperty) {
        return null;
    }

    return property.ivar;
}


shouldSynthesizeIvarForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    let hasGetter = property.getter ? this.hasInstanceMethod(property.getter) : false;
    let hasSetter = property.setter ? this.hasInstanceMethod(property.setter) : false;

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


shouldGenerateGetterImplementationForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    if (property.getter) {
        let method = this._instanceMethodMap[property.getter];
        return method && method.synthesized;
    }

    return false;
}


shouldGenerateSetterImplementationForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == OJDynamicProperty) return false;

    if (property.setter) {
        let method = this._instanceMethodMap[property.setter];
        return method && method.synthesized;
    }

    return false;
}


addIvar(ivar)
{
    let name = ivar.name;

    if (this._ivarMap[name]) {
        Utils.throwError(OJError.DuplicateIvarDefinition, "Instance variable " + name + " has previous declaration");
    }

    this._ivarMap[name] = ivar;    
}


addProperty(ojProperty)
{
    let name = ojProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(OJError.DuplicatePropertyDefinition, "Property " + name + " has previous declaration");
    }

    this._propertyMap[name] = ojProperty;
}


makePropertySynthesized(name, backing)
{
    let property = this._propertyMap[name];
    if (!property) {
        Utils.throwError(OJError.UnknownProperty, "Unknown property: " + name);
    } else if (property.ivar == OJDynamicProperty) {
        Utils.throwError(OJError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
    } else if (property.ivar) {
        Utils.throwError(OJError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
    }

    property.ivar = backing;
}


makePropertyDynamic(name)
{
    let property = this._propertyMap[name];
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


addMethod(method)
{
    let selectorName = method.selectorName;
    let selectorType = method.selectorType;
    let isClass      = method.selectorType == "+";

    let map = isClass ? this._classMethodMap : this._instanceMethodMap;

    // +alloc, +new, -init, and -self are promoted to returnType "instancetype"
    // See http://clang.llvm.org/docs/LanguageExtensions.html
    if (isClass) {
        if (selectorName.match(/_*new($|[^a-z])/) || selectorName.match(/_*alloc($|[^a-z])/)) {
            method.returnType = "instancetype";
        }
    } else {
        if (selectorName.match(/_*init($|[^a-z])/) || selectorName.match(/_*self($|[^a-z])/)) {
            method.returnType = "instancetype";
        }
    }

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


getAllIvars()
{
    return _.values(this._ivarMap);
}


getAllIvarNamesWithoutProperties()
{
    let names = _.map(this.getAllIvars(), function(ivar) {
        return ivar.name;
    });

    let toRemove = _.map(_.values(this._propertyMap), function(property) {
        return property.ivar;
    });

    toRemove.unshift(names);
    names = _.without.apply(names, toRemove);

    return names;
}


getAllMethods()
{
    return _.values(this._classMethodMap).concat(_.values(this._instanceMethodMap));
}


getClassMethods()
{
    return _.values(this._classMethodMap);
}


getInstanceMethods()
{
    return _.values(this._instanceMethodMap);
}


getInstanceMethodWithName(selectorName)
{
    return this._instanceMethodMap[selectorName];
}


getClassMethodWithName(selectorName)
{
    return this._classMethodMap[selectorName];
}


getPropertyWithName(propertyName)
{
    return this._propertyMap[propertyName];
}

}
