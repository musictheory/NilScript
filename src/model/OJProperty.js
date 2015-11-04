/*
    OJProperty.js
    Simple model class for a @property on a class
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


function OJProperty(name, type, writable, getter, setter, ivar)
{
    this.name     = name;
    this.type     = type;
    this.writable = writable;
    this.getter   = getter;
    this.setter   = setter;
    this.ivar     = ivar;
}


module.exports = OJProperty;
