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
const NSProperty  = require("./NSProperty");
const NSMethod    = require("./NSMethod");
const NSObserver  = require("./NSObserver");


module.exports = class NSClass {


constructor(location, name, inheritedNames)
{
    this.location       = location;
    this.name           = name;
    this.inheritedNames = inheritedNames || [ ];

    // Is this class in the current compilation unit?  *not archived*
    this.local = true;

    // prepare() checks this and sets it to true
    this.prepared = false;

    // Warnings during the prepare() phase
    this.prepareWarnings = [ ];
    this.superclass      = null;

    // All selectors the class responds to (inherited + synthesized). *not archived*
    this._knownSelectors = null;

    this._myIvars    = null;  // Only my ivar names
    this._knownIvars = null;  // My ivars + inherited ivar names

    this._propertyMap       = { };
    this._observerMap       = { };
    this._classMethodMap    = { };
    this._instanceMethodMap = { };
    this._usedIvarMap       = { };
}


loadState(state)
{
    this.location        = state.location;
    this.name            = state.name;
    this.inheritedNames  = state.inheritedNames || [ ];
    this.didSynthesis    = state.didSynthesis;

    _.each(state.properties, p => {
        this.addProperty(new NSProperty(p.location, p.name, p.type, p.ivar, p.getter, p.setter, false));
    });

    _.each(state.observers, o => {
        this.addObserver(new NSObserver(o.location, o.name, o.after));
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
        inheritedNames:  this.inheritedNames,
        didSynthesis:  !!this.didSynthesis,

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

    let inheritedPropertyNames = { };

     _.each(this._getClassHierarchy(model), cls => {
        _.each(cls.getAllProperties(), property => {
            inheritedPropertyNames[property.name] = true;
        });
    });

    let properties = _.values(this._propertyMap);

    for (let i = 0, length = properties.length; i < length; i++) {
        let property = properties[i];

        let location = property.location;
        let name     = property.name;
        let ivar     = property.ivar;
        let getter   = property.getter;
        let setter   = property.setter;

        if (inheritedPropertyNames[name]) {
            throw Utils.makeError(NSError.DuplicateProperty, `Property "${name}" declared in superclass`, location);
        }

        let getterName = getter ? getter.name : null;
        let setterName = setter ? setter.name : null;

        let getterMethod = getterName ? this._instanceMethodMap[getterName] : null;
        let setterMethod = setterName ? this._instanceMethodMap[setterName] : null;

        let needsBacking = !!this._usedIvarMap[ivar];

        if (getterName && !getterMethod) {
            getterMethod = property.generateGetterMethod();
            getterMethod.synthesized = true;
            this._instanceMethodMap[getterName] = getterMethod;
            needsBacking = true;
        }

        if (setterName && !setterMethod) {
            setterMethod = property.generateSetterMethod();
            setterMethod.synthesized = true;
            this._instanceMethodMap[setterName] = setterMethod;
            needsBacking = true;
        }

        property.needsBacking = needsBacking;
    }

    this.didSynthesis = true;
}


_getClassHierarchy(model, includeThis)
{
    let visited = [ this.name ];
    let result  = includeThis ? [ this ] : [ ];

    let currentSuperclass = this.superclass;
    while (currentSuperclass) {
        result.push(currentSuperclass);
        currentSuperclass = currentSuperclass.superclass;
    }

    return result;
}


_checkObservers()
{
    let knownSelectors = this._knownSelectors;

    _.each(_.values(this._observerMap), observers => {
        _.each(observers, observer => {
            let after  = observer.after;

            if (after && !knownSelectors[after]) {
                this.prepareWarnings.push(Utils.makeError(NSWarning.UnknownSelector, `Unknown selector: "${after}"`, observer.location));
            }

            let name = observer.name;
            let property = this._propertyMap[name];

            if (!property) {
                this.prepareWarnings.push(Utils.makeError(NSWarning.UnknownProperty, `Unknown property: "${name}"`, observer.location));
            }
        });
    });
}


inherit(model)
{
    let mySuperclass = null;
    let myProtocols  = [ ];

    let location = this.location;

    _.each(this.inheritedNames, name => {
        let cls      = model.classes[name];
        let protocol = model.protocols[name];

        if (cls) {
            if (mySuperclass) {
                throw Utils.makeError(NSError.InheritanceError, `Cannot inherit from both "${name}" and "${mySuperclass.name}"`, location);
            } else {
                mySuperclass = cls;
            }
          
        } else if (protocol) {
            myProtocols.push(protocol);

        } else {
            throw Utils.makeError(NSError.InheritanceError, `Unknown class or protocol: "${name}"`, location);
        }
    });

    this.superclass = mySuperclass;
    this.protocols  = myProtocols;
}


prepare(model)
{
    if (this.prepared) return;
    this.prepared = true;

    let superclass = this.superclass;

    if (superclass) {
        superclass.prepare(model);
    }

    this.prepareWarnings = [ ];

    this._doAutomaticSynthesis(model);

    this._knownSelectors = { };

    _.each(_.keys(this._instanceMethodMap), selectorName => {
        this._knownSelectors[selectorName] = 1;
    });


    this._myIvars    = { };
    this._knownIvars = { };

    _.each(_.values(this._propertyMap), property => {
        let ivar = property.ivar;
        this._myIvars[ivar] = this._knownIvars[ivar] = true;
    });

    if (superclass) {
        this._knownSelectors = _.merge(this._knownSelectors, superclass._knownSelectors || { });
        this._knownIvars     = _.merge(this._knownIvars,     superclass._knownIvars     || { });
    }

    this._checkObservers();
}


addProperty(nsProperty)
{
    let name = nsProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(NSError.DuplicateProperty, `Property "${name}" has previous declaration`);
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
        Utils.throwError(NSError.DuplicateMethod, `Duplicate declaration of method "${selectorName}"`);
    }

    map[selectorName] = method;
}



markUsedIvar(ivar)
{
    this._usedIvarMap[ivar] = true;
}


// Returns true if the identifier belongs to an ivar name or inherited ivar name
isIvar(ivar, allowInherited)
{
    let map = allowInherited ? this._knownIvars : this._myIvars;
    return !!map[ivar];
}


getAllProperties()
{
    return _.values(this._propertyMap);
}


getObserversWithName(propertyName)
{
    return this._observerMap[propertyName];
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
    return selectorName ? this._instanceMethodMap[selectorName] : null;
}


getClassMethodWithName(selectorName)
{
    return selectorName ? this._classMethodMap[selectorName] : null;
}


getPropertyWithName(propertyName)
{
    return this._propertyMap[propertyName];
}


}
