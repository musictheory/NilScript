/*
    NSProperty.js
    Simple model class for a @property on a class
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _ from "lodash";


export class NSProperty {


constructor(location, name, type, isStatic, attributes)
{
    this.location   = location;
    this.name       = name;
    this.type       = type;
    this.isStatic   = isStatic;
    this.attributes = attributes;
}


get wantsGetter()
{
    let isPrivate = this.attributes.indexOf("private") >= 0;
    return !isPrivate;
}


get wantsSetter()
{
    let isPrivate  = this.attributes.indexOf("private")  >= 0;
    let isReadOnly = this.attributes.indexOf("readonly") >= 0;
    
    return (!isPrivate && !isReadOnly);
}


get legacySetterName()
{
    if (this.wantsSetter) {
        return "set" + this.name[0].toUpperCase() + this.name.slice(1);
    } else {
        return null;
    }
}


}
