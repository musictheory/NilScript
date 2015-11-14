/*
    OJStruct.js
    Model class for an @struct
    (c) 2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const OJError     = require("../errors").OJError;
const Utils       = require("../utils");
const _           = require("lodash");


module.exports = class OJStruct {


constructor(name)
{
    this.name = name;
    this.variables = [ ];

    // Is this struct in the current compilation unit?
    this.local = true;
}


loadState(state)
{
    this.name      = state.name;
    this.variables = state.variables || [ ];
}


saveState()
{
    return {
        name:      this.name,
        variables: this.variables
    };
}


addVariable(name, annotation)
{
    this.variables.push({ name: name, annotation: annotation || null });
}


}
