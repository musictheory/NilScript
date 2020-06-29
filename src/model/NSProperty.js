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


constructor(location, name, type, ivar, getter, setter, optional)
{
    this.location = location;
    this.name     = name;
    this.type     = type;
    this.ivar     = ivar;
    this.getter   = getter;
    this.setter   = setter;
    this.optional = optional;
    this.needsBacking = false;
}


generateGetterMethod()
{
    let getter = this.getter;
    return getter ? new NSMethod(_.clone(this.location), getter.name, "-", this.type, [ ]) : null;
}


generateSetterMethod()
{
    let setter = this.setter;
    return setter ? new NSMethod(_.clone(this.location), setter.name, "-", "void", [ this.type ]) : null;
}


}
