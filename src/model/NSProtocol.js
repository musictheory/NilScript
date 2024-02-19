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

    // Is this class in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    let classMethodMap    = this._classMethodMap;
    let instanceMethodMap = this._instanceMethodMap;

    this.location = state.location;
    this.name = state.name;
    this.protocolNames = state.protocolNames || [ ];

    _.each(state.classMethods, function(m) {
        classMethodMap[m.name] = new NSMethod(m.location, m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.name] = new NSMethod(m.location, m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
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


saveState()
{
    return {
        location:        this.location,
        name:            this.name,
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap),
    }
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


}
