/*
    NSProtocol.js
    Model class for a @protocol
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { NSError } from "../Errors.js";
import { Utils   } from "../Utils.js";

import { NSMethod   } from "./NSMethod.js";
import { NSProperty } from "./NSProperty.js";


export class NSProtocol {


constructor(location, name, protocolNames)
{
    this.location = location;
    this.name = name;
    this.protocolNames = protocolNames || [ ];

    this._classMethodMap    = { };
    this._instanceMethodMap = { };
    this._propertyMap       = { };

    // Is this class in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    let classMethodMap    = this._classMethodMap;
    let instanceMethodMap = this._instanceMethodMap;
    let propertyMap       = this._propertyMap;

    this.location = state.location;
    this.name = state.name;
    this.protocolNames = state.protocolNames || [ ];

    _.each(state.classMethods, function(m) {
        classMethodMap[m.name] = new NSMethod(m.location, m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.name] = new NSMethod(m.location, m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.properties, function(p) {
        propertyMap[p.name] = new NSProperty(p.location, p.name, p.type, p.ivar, p.getter, p.setter, p.optional);
    });
}


addMethod(nsMethod)
{
    let selectorName = nsMethod.selectorName;
    let map = (nsMethod.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(NSError.DuplicateMethod, `Duplicate declaration of method "${selectorName}"`);
    }

    map[selectorName] = nsMethod;
}


addProperty(nsProperty)
{
    let name = nsProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(NSError.DuplicateProperty, `Property "${name}" has previous declaration`);
    }

    this._propertyMap[name] = nsProperty;
}


saveState()
{
    return {
        location:        this.location,
        name:            this.name,
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap),
        properties:      _.values(this._properties)
    }
}


getAllMethods()
{
    let results = _.values(this._classMethodMap).concat(_.values(this._instanceMethodMap));

    _.each(this._propertyMap, nsProperty => {
        let getter   = nsProperty.getter;
        let setter   = nsProperty.setter;
        let type     = nsProperty.type;
        let optional = nsProperty.optional;

        if (setter) {
            if (!this._instanceMethodMap[setter]) {
                results.push(nsProperty.generateSetterMethod());
            }
        }

        if (getter) {
            if (!this._instanceMethodMap[getter]) {
                results.push(nsProperty.generateGetterMethod());
            }
        }
    });

    return results;
}


getClassMethods()
{
    return _.values(this._classMethodMap);
}


getInstanceMethods()
{
    return _.values(this._instanceMethodMap);
}


}
