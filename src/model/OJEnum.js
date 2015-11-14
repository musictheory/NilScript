/*
    OJEnum.js
    Model class for an @enum declaration
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJEnum {


constructor(name, unsigned, values)
{
    this.name     = name;
    this.unsigned = unsigned;
    this.values   = values || { };
    this.local    = true;
}


loadState(state)
{
    this.name     =   state.name;
    this.unsigned = !!state.unsigned;
    this.values   =   state.values || { };
}


saveState()
{
    return {
        name:     this.name,
        unsigned: this.unsigned,
        values:   this.values
    };
}


addValue(name, value)
{
    this.values[name] = value;
}


}
