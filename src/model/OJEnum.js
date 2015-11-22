/*
    OJEnum.js
    Model class for an @enum declaration
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJEnum {


constructor(name, unsigned, bridged)
{
    this.name      =   name;
    this.unsigned  =   unsigned;
    this.anonymous =  !name;
    this.values    =   { };
    this.bridged   = !!bridged;
    this.local     =   true;
}


loadState(state)
{
    this.name      =   state.name;
    this.unsigned  = !!state.unsigned;
    this.anonymous = !!state.anonymous;
    this.bridged   =   state.bridged;
    this.values    =   state.values || { };
}


saveState()
{
    return {
        name:      this.name,
        bridged:   this.bridged,
        unsigned:  this.unsigned,
        anonymous: this.anonymous,
        values:    this.values
    };
}


addValue(name, value)
{
    this.values[name] = value;
}


}
