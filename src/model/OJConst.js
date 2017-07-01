/*
    OJConst.js
    Model class for an @const declaration
    (c) 2013-2017 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJConst {


constructor(location, name, value, raw, bridged)
{
    this.location = location;
    this.name     = name;
    this.value    = value;
    this.raw      = raw;
    this.bridged  = bridged;
    this.local    = true;
}


loadState(state)
{
    this.location = state.location;
    this.name     = state.name;
    this.value    = state.value;
    this.raw      = state.raw;
    this.bridged  = state.bridged;
}


saveState()
{
    return {
        location: this.location,
        name:     this.name,
        value:    this.value,
        raw:      this.raw,
        bridged:  this.bridged
    };
}


}
