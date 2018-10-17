/*
    NSClass.js
    Model class for an NilScript class implementation
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _           = require("lodash");
const NSError     = require("../Errors").NSError;
const NSWarning   = require("../Errors").NSWarning;
const Utils       = require("../Utils");
const NSIvar      = require("./NSIvar");
const NSProperty  = require("./NSProperty");
const NSMethod    = require("./NSMethod");
const NSObserver  = require("./NSObserver");


const NSDynamicProperty = " NSDynamicProperty ";


module.exports = class NSClass {


constructor(location, name, superclassName, protocolNames)
{
    this.location       = location;
    this.name           = name;
    this.superclassName = superclassName;
    this.protocolNames  = protocolNames || [ ];

    // For category definitions that appear before the implementation
    // Also used when a class defines a superclass that hasn't been traversed yet
    this.placeholder = false;
 
    // Is this class in the current compilation unit?  *not archived*
    this.local = true;

    // prepare() checks this and sets it to true
    this.prepared = false;

    // Warnings during the prepare() phase
    this.prepareWarnings = [ ];
    this.superclass      = null;

    // All selectors the class responds to (inherited + synthesized). *not archived*
    this._knownSelectors = null;

    this._ivarMap           = { };
    this._propertyMap       = { };
    this._observerMap       = { };
    this._classMethodMap    = { };
    this._instanceMethodMap = { };
}


loadState(state)
{
    this.location        = state.location;
    this.name            = state.name;
    this.superclassName  = state.superclassName;
    this.protocolNames   = state.protocolNames || [ ];
    this.placeholder     = state.placeholder;
    this.didSynthesis    = state.didSynthesis;

    _.each(state.ivars, i => {
        this.addIvar(new NSIvar(i.location, i.name, i.type));
    });

    _.each(state.properties, p => {
        this.addProperty(new NSProperty(p.location, p.name, p.type, p.writable, p.copyOnRead, p.copyOnWrite, p.getter, p.setter, p.ivar, false));
    });

    _.each(state.observers, o => {
        this.addObserver(new NSObserver(o.location, o.name, o.change, o.before, o.after));
    });

    _.each(state.methods, m => {
        this.addMethod(new NSMethod(m.location, m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, false));
    });
}


saveState()
{
    return {
        location:        this.location,
        name:            this.name,
        superclassName:  this.superclassName,
        protocolNames:   this.protocolNames,
        didSynthesis:  !!this.didSynthesis,
        placeholder:     this.placeholder,

        ivars:      _.values(this._ivarMap),
        properties: _.values(this._propertyMap),

        observers: _.flatten(
            _.values(this._observerMap)
        ),

        methods: _.flatten([
            _.values(this._classMethodMap),
            _.values(this._instanceMethodMap)
        ])
    }
}


_doAutomaticSynthesis(model)
{
    if (this.didSynthesis) {
        return;
    }

    let myIvarNames = this.getAllIvarNames();
    let usedIvarNameMap = { };

     _.each(this._getClassHierarchy(model), cls => {
        _.each(cls.getAllIvarNames(), name => {
            usedIvarNameMap[name] = true;
        });
    });

    _.each(this._ivarMap, (ivar, name) => {
        if (usedIvarNameMap[name]) {
            throw Utils.makeError(NSError.DuplicateInstanceVariable, "Instance variable '" + name + "' declared in superclass", ivar.location);
        }
    });

    let properties = _.values(this._propertyMap);
    let backingIvarToPropertyNameMap = { };

    for (let i = 0, length = properties.length; i < length; i++) {
        let property = properties[i];

        let location = property.location;
        let name     = property.name;
        let ivarName = property.ivar;
        let getter   = property.getter;
        let setter   = property.setter;

        if (ivarName == NSDynamicProperty) continue;

        let hadExplicitlySynthesizedIvarName = !!ivarName;

        if (!ivarName) {
            ivarName = "_" + name;
            property.ivar = ivarName;

            if (usedIvarNameMap[ivarName]) {
                let message = `Auto property synthesis for '${name}' will use an inherited instance variable. use @dynamic to acknowledge intention.`;
                this.prepareWarnings.push(Utils.makeError(NSWarning.NeedsExplicitDynamic, message, property.location));
            }

        } else {
            if (usedIvarNameMap[ivarName]) {
                let message = `Property '${name}' will use an inherited instance variable due to @synthesize.`;
                this.prepareWarnings.push(Utils.makeError(NSWarning.PropertyUsingInherited, message, property.location));
            }            
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
            Utils.throwError(NSError.InstanceVariableAlreadyClaimed, "Synthesized properties '" +  backingIvarToPropertyNameMap[ivarName] + "' and '" + name + "' both claim instance variable '" + ivarName + "'");
        } else {
            backingIvarToPropertyNameMap[ivarName] = name;
        }

        // Generate backing ivar
        if (generateBackingIvar) {
            ivar = new NSIvar(_.clone(location), ivarName, property.type);
            ivar.synthesized = true;
            this._ivarMap[ivarName] = ivar;
        }

        if (getter && !getterMethod) {
            getterMethod = property.generateGetterMethod();
            getterMethod.synthesized = true;
            this._instanceMethodMap[getter] = getterMethod;
        }

        if (setter && !setterMethod) {
            setterMethod = property.generateSetterMethod();
            setterMethod.synthesized = true;
            this._instanceMethodMap[setter] = setterMethod;
        }
    }

    this.didSynthesis = true;
}


_getClassHierarchy(model, includeThis)
{
    let visited = [ this.name ];
    let result  = includeThis ? [ this ] : [ ];

    let currentSuperclass = model.classes[this.superclassName];
    while (currentSuperclass) {

        if (visited.indexOf(currentSuperclass.name) >= 0) {
            throw Utils.makeError(NSError.CircularClassHierarchy, "Circular class hierarchy detected: '" + visited.join("', '") + "'");
        }

        visited.push(currentSuperclass.name);
        result.push(currentSuperclass);

        currentSuperclass = model.classes[currentSuperclass.superclassName];
    }

    return result;
}


_checkClassHierarchy(model)
{
    let visited = [ this.name ];
    let superclassName = this.superclassName;

    let currentSuperclass = this.superclass;

    if (superclassName && (!this.superclass || this.superclass.placeholder)) {
        throw Utils.makeError(NSError.UnknownSuperclass, "Unknown superclass: '" + this.superclassName + "'", this.location);
    }

    // _getClassHierarchy() performs our circular check for safety
    this._getClassHierarchy(model);
}


_checkObservers()
{
    let knownSelectors = this._knownSelectors;

    _.each(_.values(this._observerMap), observers => {
        _.each(observers, observer => {
            let before = observer.before;
            let after  = observer.after;

            if (before && !knownSelectors[before]) {
                this.prepareWarnings.push(Utils.makeError(NSWarning.UnknownSelector, "Unknown selector: '" + before + "'", observer.location));
            }

            if (after && !knownSelectors[after]) {
                this.prepareWarnings.push(Utils.makeError(NSWarning.UnknownSelector, "Unknown selector: '" + after + "'", observer.location));
            }

            let name = observer.name;
            let property = this._propertyMap[name];

            if (!property) {
                this.prepareWarnings.push(Utils.makeError(NSWarning.UnknownProperty, "Unknown property: '" + name + "'", observer.location));
            }
        });
    });
}


prepare(model)
{
    if (this.prepared) return;
    this.prepared = true;

    let superclass = this.superclassName ? model.classes[this.superclassName] : null;
    this.superclass = superclass;

    this._knownSelectors = { };

    _.each(_.keys(this._instanceMethodMap), selectorName => {
        this._knownSelectors[selectorName] = 1;
    });

    if (superclass) {
        superclass.prepare(model);
        this._knownSelectors = _.merge(this._knownSelectors, superclass._knownSelectors || { });
    }

    this.prepareWarnings = [ ];

    this._checkClassHierarchy(model);
    this._doAutomaticSynthesis(model);

    this._checkObservers();
}


isIvar(ivarName)
{
    return !!this._ivarMap[ivarName];
}


getIvarNameForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!propertyName) return null;

    if (property.ivar == NSDynamicProperty) {
        return null;
    }

    return property.ivar;
}


shouldSynthesizeIvarForPropertyName(propertyName)
{
    let property = this._propertyMap[propertyName];
    if (!property) return false;

    if (property.ivar == NSDynamicProperty) return false;

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

    if (property.ivar == NSDynamicProperty) return false;

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

    if (property.ivar == NSDynamicProperty) return false;

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
        Utils.throwError(NSError.DuplicateInstanceVariable, "Instance variable " + name + " has previous declaration");
    }

    this._ivarMap[name] = ivar;    
}


addProperty(nsProperty)
{
    let name = nsProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(NSError.DuplicateProperty, "Property " + name + " has previous declaration");
    }

    this._propertyMap[name] = nsProperty;
}


addObserver(nsObserver)
{
    let name = nsObserver.name;

    let existing = this._observerMap[name];

    if (!existing) {
        this._observerMap[name] = existing = [ ];
    }

    existing.push(nsObserver);
}


makePropertySynthesized(name, backing)
{
    let property = this._propertyMap[name];
    if (!property) {
        Utils.throwError(NSError.UnknownProperty, "Unknown property: " + name);
    } else if (property.ivar == NSDynamicProperty) {
        Utils.throwError(NSError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
    } else if (property.ivar) {
        Utils.throwError(NSError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
    }

    property.ivar = backing;
}


makePropertyDynamic(name)
{
    let property = this._propertyMap[name];
    if (!property) {
        Utils.throwError(NSError.UnknownProperty, "Unknown property: " + name);
    } else if (property.ivar == NSDynamicProperty) {
        Utils.throwError(NSError.PropertyAlreadyDynamic, "Property " + name + " already declared dynamic");
    } else if (property.ivar) {
        Utils.throwError(NSError.PropertyAlreadySynthesized, "Property " + name + " already synthesized to " + property.ivar);
    }

    property.ivar = NSDynamicProperty;
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
        Utils.throwError(NSError.DuplicateMethod, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


respondsToSelector(selectorName)
{
    return !!_knownSelectors[selectorName];
}


getAllIvars()
{
    return _.values(this._ivarMap);
}


getAllIvarNames()
{
    return _.map(this.getAllIvars(), ivar => ivar.name);
}


getAllIvarNamesWithoutProperties()
{
    let names = this.getAllIvarNames();

    let toRemove = _.map(_.values(this._propertyMap), property => property.ivar);

    toRemove.unshift(names);
    names = _.without.apply(names, toRemove);

    return names;
}


getAllProperties()
{
    return _.values(this._propertyMap);
}


getAllDynamicProperties()
{
    return _.filter(this.getAllProperties(), property => {
        return property.ivar == NSDynamicProperty;
    });
}


getObserversWithName(propertyName)
{
    return this._observerMap[propertyName];
}


getAllMethods()
{
    return _.values(this._classMethodMap).concat(_.values(this._instanceMethodMap));
}


getImplementedClassMethods()
{
    return _.values(this._classMethodMap);
}


getImplementedInstanceMethods()
{
    return _.values(this._instanceMethodMap);
}


getImplementedInstanceMethodWithName(selectorName)
{
    return this._instanceMethodMap[selectorName];
}


getImplementedClassMethodWithName(selectorName)
{
    return this._classMethodMap[selectorName];
}


getPropertyWithName(propertyName)
{
    return this._propertyMap[propertyName];
}

}
