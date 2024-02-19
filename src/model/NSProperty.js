/*
    NSProperty.js
    Simple model class for a @property on a class
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _ from "lodash";
import { NSMethod } from "./NSMethod.js";


export class NSProperty {


constructor(location, name, type, attributes)
{
    this.location   = location;
    this.name       = name;
    this.type       = type;
    this.attributes = attributes;
}


get getterName()
{
    let isPrivate = this.attributes.indexOf("private") >= 0;

    if (!isPrivate) {
        return this.name;
    } else {
        return null;
    }
}


get setterName()
{
    let isPrivate  = this.attributes.indexOf("private")  >= 0;
    let isReadOnly = this.attributes.indexOf("readonly") >= 0;
    
    if (!isPrivate && !isReadOnly) {
        return ("set" + this.name[0].toUpperCase() + this.name.slice(1) + ":");
    } else {
        return null;
    }
}


generateGetterMethod()
{
    let getterName = this.getterName;
    return getterName ? new NSMethod(_.clone(this.location), getterName, "-", this.type, [ ]) : null;
}


generateSetterMethod()
{
    let setterName = this.setterName;
    return setterName ? new NSMethod(_.clone(this.location), setterName, "-", "void", [ this.type ]) : null;
}


}
