/*
    NSProtocol.js
    Model class for a @protocol
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { NSError } from "../Errors.js";
import { Utils   } from "../Utils.js";

import { NSProperty } from "./NSProperty.js";


export class NSProtocol {


constructor(location, name, protocolNames)
{
    this.location = location;
    this.name = name;
    this.protocolNames = protocolNames || [ ];

    this._methods = [ ];

    // Is this class in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    this.location = state.location;
    this.name = state.name;
    this.protocolNames = state.protocolNames || [ ];
}


addMethod(method)
{
    this._methods.push(method);
}


saveState()
{
    return {
        location: this.location,
        name:     this.name,
        methods:  _.values(this._methods)
    };
}


getMethods()
{
    return this._methods;
}


}
