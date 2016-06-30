/*
    OJProperty.js
    Simple model class for a @property on a class
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJProperty {


constructor(name, type, writable, copyOnRead, copyOnWrite, getter, setter, ivar, optional)
{
    this.name        = name;
    this.type        = type;
    this.writable    = writable;
    this.copyOnRead  = copyOnRead;
    this.copyOnWrite = copyOnWrite;
    this.getter      = getter;
    this.setter      = setter;
    this.ivar        = ivar;
    this.optional    = optional;
}


}
