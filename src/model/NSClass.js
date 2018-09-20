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
        this.addIvar(new NSIvar(i.location, i.name, i.className, i.type));
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


_doAutomaticSynthesis()
{
    if (this.didSynthesis) {
        return;
    }

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
            ivar = new NSIvar(_.clone(location), ivarName, this.name, property.type);
            ivar.synthesized = true;
            this._ivarMap[ivarName] = ivar;
        }

        if (getter && !getterMethod) {
            getterMethod = new NSMethod(_.clone(location), getter, "-", property.type, [ ]);
            getterMethod.synthesized = true;
            this._instanceMethodMap[getter] = getterMethod;
        }

        if (setter && !setterMethod) {
            setterMethod = new NSMethod(_.clone(location), setter, "-", "void", [ property.type ]);
            setterMethod.synthesized = true;
            this._instanceMethodMap[setter] = setterMethod;
        }
    }

    this.didSynthesis = true;
}


_checkForCircularHierarchy(model)
{
    let visited = [ this.name ];
    let superclass = this.superclassName ? model.classes[this.superclassName] : null;

    while (superclass) {
        if (visited.indexOf(superclass.name) >= 0) {
             this.prepareWarnings.push(Utils.makeError(NSWarning.CircularClassHierarchy, "Circular class hierarchy detected: '" + visited.join(",") + "'", this.location));
             break;
        }

        visited.push(superclass.name);

        superclass = model.classes[superclass.superclassName];
    }
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

    this.prepareWarnings = [ ];

    this._doAutomaticSynthesis();
    this._checkForCircularHierarchy(model);

    this._knownSelectors = { };

    _.each(_.keys(this._instanceMethodMap), selectorName => {
        this._knownSelectors[selectorName] = 1;
    });

    let superclass = this.superclassName ? model.classes[this.superclassName] : null;

    if (superclass) {
        superclass.prepare(model);
        this._knownSelectors = _.merge(this._knownSelectors, superclass._knownSelectors || { });
    }

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
        Utils.throwError(NSError.DuplicateIvarDefinition, "Instance variable " + name + " has previous declaration");
    }

    this._ivarMap[name] = ivar;    
}


addProperty(nsProperty)
{
    let name = nsProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(NSError.DuplicatePropertyDefinition, "Property " + name + " has previous declaration");
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

    property.ivar   = NSDynamicProperty;
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
        Utils.throwError(NSError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
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
