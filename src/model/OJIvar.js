/*
    OJIvar.js
    Simple model class for an instance variable
    (c) 2013-2017 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJIvar {


constructor(location, name, className, type)
{
    this.location    = location;
    this.name        = name;
    this.className   = className;
    this.type        = type;
    this.synthesized = false;
}


}
