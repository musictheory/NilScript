/*
    OJEnum.js
    Model class for an @enum declaration
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


function OJEnum(name, unsigned, values)
{
    this.name     = name;
    this.unsigned = unsigned;
    this.values   = values || { };
}


OJEnum.prototype.addValue = function(name, value)
{
    this.values[name] = value;
}


module.exports = OJEnum;
