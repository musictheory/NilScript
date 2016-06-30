/*
    OJProtocol.js
    Model class for a @protocol
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const OJError    = require("../errors").OJError;
const Utils      = require("../utils");
const OJProperty = require("./OJProperty");
const OJMethod   = require("./OJMethod");


module.exports = class OJProtocol {


constructor(name, protocolNames)
{
    this.name = name;
    this.protocolNames = protocolNames || [ ];

    this._classMethodMap    = { };
    this._instanceMethodMap = { };
    this._propertyMap       = { };

    // { path: ..., line: ...} pair for error messages, *not archived*
    this.pathLine = null;

    // Is this class in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    let classMethodMap    = this._classMethodMap;
    let instanceMethodMap = this._instanceMethodMap;
    let propertyMap       = this._propertyMap;

    this.name = state.name;
    this.protocolNames = state.protocolNames || [ ];

    _.each(state.classMethods, function(m) {
        classMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.properties, function(p) {
        propertyMap[p.name] = new OJProperty(p.name, p.type, p.writable, p.copyOnRead, p.copyOnWrite, p.getter, p.setter, p.ivar, p.optional);
    });
}


addMethod(ojMethod)
{
    let selectorName = ojMethod.selectorName;
    let map = (ojMethod.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = ojMethod;
}


addProperty(ojProperty)
{
    let name = ojProperty.name;

    if (this._propertyMap[name]) {
        Utils.throwError(OJError.DuplicatePropertyDefinition, "Property " + name + " has previous declaration");
    }

    this._propertyMap[name] = ojProperty;
}


saveState()
{
    return {
        name: this.name,
        classMethods:    _.values(this._classMethodMap),
        instanceMethods: _.values(this._instanceMethodMap),
        properties:      _.values(this._properties)
    }
}


getAllMethods()
{
    let results = _.values(this._classMethodMap).concat(_.values(this._instanceMethodMap));

    _.each(this._propertyMap, ojProperty => {
        let getter   = ojProperty.getter;
        let setter   = ojProperty.setter;
        let type     = ojProperty.type;
        let optional = ojProperty.optional;

        if (ojProperty.writable && setter) {
            if (!this._instanceMethodMap[setter]) {
                results.push(new OJMethod(setter, "-", "void", [ type ], optional));
            }
        }

        if (getter) {
            if (!this._instanceMethodMap[getter]) {
                results.push(new OJMethod(getter, "-", type, [ ], optional));
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
