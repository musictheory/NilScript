/*
    OJType.js
    Model class for an @type or internal alias
    (c) 2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const OJError     = require("../errors").OJError;
const Utils       = require("../utils");
const _           = require("lodash");


class OJType {

constructor(name, kind, parameterNames, parameterTypes, returnType)
{
    this.name = name;
    this.kind = kind;
    this.parameterNames = parameterNames;
    this.parameterTypes = parameterTypes;
    this.returnType = returnType;

    // Is this type in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    this.name           = state.name;
    this.kind           = state.kind;
    this.parameterNames = state.parameterNames;
    this.parameterTypes = state.parameterTypes;
    this.returnType     = state.returnType;
}


saveState()
{
    return {
        name:           this.name,
        kind:           this.kind,
        parameterNames: this.parameterNames,
        parameterTypes: this.parameterTypes,
        returnType:     this.returnType
    };
}

}

OJType.KindPrimitive = "primitive";
OJType.KindAlias     = "alias";
OJType.KindFunction  = "function";
OJType.KindTuple     = "tuple";
OJType.KindObject    = "object";

OJType.makePrimitive = function(name)
{
    return new OJType(name, OJType.KindPrimitive, null, null, null);
}


OJType.makeAlias = function(name, original)
{
    return new OJType(name, OJType.KindAlias, null, null, original);
}


OJType.makeFunction = function(name, parameterNames, parameterTypes, returnType)
{
    return new OJType(name, OJType.KindFunction, parameterNames, parameterTypes, returnType);
}


OJType.makeObject = function(name, memberNames, memberTypes)
{
    return new OJType(name, OJType.KindObject, memberNames, memberTypes, null);
}


OJType.makeTuple = function(name, memberTypes)
{
    return new OJType(name, OJType.KindTuple, null, memberTypes, null);
}


module.exports = OJType;
