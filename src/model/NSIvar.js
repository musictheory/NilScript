/*
    NSIvar.js
    Simple model class for an instance variable
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class NSIvar {


constructor(location, name, type)
{
    this.location    = location;
    this.name        = name;
    this.type        = type;
    this.synthesized = false;
}


}
