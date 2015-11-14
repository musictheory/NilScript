/*
    OJProtocol.js
    Model class for a @protocol
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const OJError     = require("../errors").OJError;
const Utils       = require("../utils");
const _           = require("lodash");


module.exports = class OJProtocol {


constructor(name, protocolNames)
{
    this.name = name;
    this.protocolNames = protocolNames || [ ];

    this._classMethodMap    = { };
    this._instanceMethodMap = { };

    // Clone of the AST node's loc property.  *not archived*
    this.location = null;

    // Is this class in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    var classMethodMap    =  this._classMethodMap;
    var instanceMethodMap =  this._instanceMethodMap;

    this.name = state.name;
    this.protocolNames = state.protocolNames || [ ];

    _.each(state.classMethods, function(m) {
        classMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });

    _.each(state.instanceMethods, function(m) {
        instanceMethodMap[m.name] = new OJMethod(m.selectorName, m.selectorType, m.returnType, m.parameterTypes, m.variableNames, m.optional);
    });
}


addMethod(method)
{
    var selectorName = method.selectorName;
    var map = (method.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


saveState()
{
    return {
        name:                    this.name,
        optionalClassMethods:    _.values(this._optionalClassMethodMap),
        optionalInstanceMethods: _.values(this._optionalInstanceMethodMap),
        requiredClassMethods:    _.values(this._requiredClassMethodMap),
        requiredInstanceMethods: _.values(this._requiredInstanceMethodMap)
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
