/*
    NSClass.js
    Model class for an NilScript class implementation
    (c) 2013-2023d musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { NSError    } from "../Errors.js";
import { Utils      } from "../Utils.js";

import { NSProperty } from "./NSProperty.js";


export class NSClass {


constructor(location, name, superClassName, interfaceNames)
{
    this.location       = location;
    this.name           = name;
    this.superClassName = superClassName;
    this.interfaceNames = interfaceNames;

    // Is this class in the current compilation unit?  *not archived*
    this.local = true;

    // prepare() checks this and sets it to true
    this.prepared = false;

    // Warnings during the prepare() phase
    this.superClass = null;

    this._getters = new Map();
    this._setters = new Map();

    this._staticGetters = new Map();
    this._staticSetters = new Map();

    this._methods = [ ];

    this._propertyMap       = Object.create(null);
}


loadState(state)
{
    this.location        = state.location;
    this.name            = state.name;
    this.superClassName  = state.superClassName || null;
    this.interfaceNames  = state.interfaceNames || [ ];
    this.didSynthesis    = state.didSynthesis;

    _.each(state.properties, p => {
        this.addProperty(new NSProperty(p.location, p.name, p.type, p.isStatic, p.attributes));
    });
}


saveState()
{
    return {
        location:        this.location,
        name:            this.name,
        superClassName:  this.superClassName,
        interfaceNames:  this.interfaceNames,
        didSynthesis:  !!this.didSynthesis,

        properties: _.values(this._propertyMap),
    }
}


_doAutomaticSynthesis(model)
{
    if (this.didSynthesis) {
        return;
    }

    this.didSynthesis = true;
}


inherit(model)
{
    let mySuperClass = null;
    let myProtocols  = [ ];

    let location = this.location;
    
    if (this.superClassName) {
        mySuperClass = model.classes[this.superClassName];
        
        if (!mySuperClass) {
            throw Utils.makeError(NSError.InheritanceError, `Unknown class: "${this.superClassName}"`, location);
        }
    }

    _.each(this.interfaceNames, name => {
        let protocol = model.protocols[name];
      
        if (protocol) {
            myProtocols.push(protocol);

        } else {
            throw Utils.makeError(NSError.InheritanceError, `Unknown protocol: "${name}"`, location);
        }
    });

    this.superClass = mySuperClass;
    this.protocols  = myProtocols;
}


prepare(model)
{
    if (this.prepared) return;
    this.prepared = true;

    let superClass = this.superClass;

    if (superClass) {
        superClass.prepare(model);
    }

    this._doAutomaticSynthesis(model);
}


addProperty(nsProperty)
{
    let name = nsProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(NSError.DuplicateProperty, `Property "${name}" has previous declaration`);
    }

    this._propertyMap[name] = nsProperty;
}


addGetter(name, isStatic, type)
{
    let key = isStatic ? `static ${name}` : name;
    this._getters.set(key, { name, isStatic, type });
}


addSetter(name, isStatic, type)
{
    let key = isStatic ? `static ${name}` : name;
    this._setters.set(key, { name, isStatic, type });
}


getGetter(name, isStatic)
{
    let key = isStatic ? `static ${name}` : name;
    return this._getters.get(key);
}


getSetter(name, isStatic)
{
    let key = isStatic ? `static ${name}` : name;
    return this._setters.get(key);
}


addMethod(method)
{
    this._methods.push(method);
}


getAllProperties()
{
    return _.values(this._propertyMap);
}


getMethods()
{
    return this._methods;
}


getPropertyWithName(propertyName)
{
    return this._propertyMap[propertyName];
}


}
