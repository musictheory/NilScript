/*
    OJConst.js
    Model class for an @const declaration
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJConst {


constructor(name, value)
{
    this.name  = name;
    this.value = value;
    this.local = true;
}


loadState(state)
{
    this.name  = state.name;
    this.value = state.value;
}


saveState()
{
    return {
        name:  this.name,
        value: this.value
    };
}


}
