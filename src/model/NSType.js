/*
    NSType.js
    Model class for an @type or internal alias
    (c) 2017-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";
import { Utils } from "../Utils.js";


export class NSType {

constructor(name, kind, parameterNames, parameterTypes, parameterOptional, returnType)
{
    this.name = name;
    this.kind = kind;
    this.parameterNames = parameterNames;
    this.parameterTypes = parameterTypes;
    this.parameterOptional = parameterOptional;
    this.returnType = returnType;

    // Is this type in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    this.name              = state.name;
    this.kind              = state.kind;
    this.parameterNames    = state.parameterNames;
    this.parameterTypes    = state.parameterTypes;
    this.parameterOptional = state.parameterOptional;
    this.returnType        = state.returnType;
}


saveState()
{
    return {
        name:              this.name,
        kind:              this.kind,
        parameterNames:    this.parameterNames,
        parameterTypes:    this.parameterTypes,
        parameterOptional: this.parameterOptional,
        returnType:        this.returnType
    };
}

}

NSType.KindPrimitive = "primitive";
NSType.KindAlias     = "alias";
NSType.KindFunction  = "function";
NSType.KindTuple     = "tuple";
NSType.KindObject    = "object";

NSType.makePrimitive = function(name)
{
    return new NSType(name, NSType.KindPrimitive, null, null, null, null);
}


NSType.makeAlias = function(name, original)
{
    return new NSType(name, NSType.KindAlias, null, null, null, original);
}
