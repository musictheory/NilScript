/*
    OJStruct.js
    Model class for an @struct
    (c) 2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var OJError     = require("../errors").OJError;
var Utils       = require("../utils");
var _           = require("lodash");


function OJStruct(name)
{
    this.name = name;
    this.variables = [ ];

    // Is this struct in the current compilation unit?
    this.local = true;
}


OJStruct.prototype.loadState = function(state)
{
    this.name      = state.name;
    this.variables = state.variables || [ ];
}


OJStruct.prototype.saveState = function()
{
    return {
        name:      this.name,
        variables: this.variables
    };
}


OJStruct.prototype.addVariable = function(name, annotation)
{
    this.variables.push({ name: name, annotation: annotation || null });
}


module.exports = OJStruct;
