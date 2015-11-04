/*
    OJProtocol.js
    Model class for a @protocol
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var OJError     = require("../errors").OJError;
var Utils       = require("../utils");
var _           = require("lodash");


function OJProtocol(name, protocolNames)
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


OJProtocol.prototype.loadState = function(state)
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


OJProtocol.prototype.addMethod = function(method)
{
    var selectorName = method.selectorName;
    var map = (method.selectorType == "+") ? this._classMethodMap : this._instanceMethodMap;

    if (map[selectorName]) {
        Utils.throwError(OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + selectorName + "'");
    }

    map[selectorName] = method;
}


OJProtocol.prototype.saveState = function()
{
    return {
        name:                    this.name,
        optionalClassMethods:    _.values(this._optionalClassMethodMap),
        optionalInstanceMethods: _.values(this._optionalInstanceMethodMap),
        requiredClassMethods:    _.values(this._requiredClassMethodMap),
        requiredInstanceMethods: _.values(this._requiredInstanceMethodMap)
    }
}

OJProtocol.prototype.getAllMethods = function()
{
    return _.values(this._classMethodMap).concat(_.values(this._instanceMethodMap));
}


OJProtocol.prototype.getClassMethods = function()
{
    return _.values(this._classMethodMap);
}


OJProtocol.prototype.getInstanceMethods = function()
{
    return _.values(this._instanceMethodMap);
}


module.exports = OJProtocol;
