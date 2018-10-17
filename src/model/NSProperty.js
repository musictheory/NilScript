/*
    NSProperty.js
    Simple model class for a @property on a class
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _        = require("lodash");
const NSMethod = require("./NSMethod");


module.exports = class NSProperty {


constructor(location, name, type, writable, copyOnRead, copyOnWrite, getter, setter, ivar, optional)
{
    this.location    = location;
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


generateGetterMethod()
{
    let getter = this.getter;
    return getter ? new NSMethod(_.clone(this.location), getter, "-", this.type, [ ]) : null;
}


generateSetterMethod()
{
    let setter = this.setter;
    return setter ? new NSMethod(_.clone(this.location), setter, "-", "void", [ this.type ]) : null;
}


}
