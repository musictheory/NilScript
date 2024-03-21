/*
    NSMethod.js
    Simple model class for a method on a class or protocol
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


export class NSMethod {

constructor(location, baseName, isStatic, isOptional, parameters, returnType)
{
    this.location   = location;
    this.baseName   = baseName;
    this.isStatic   = isStatic;
    this.isOptional = isOptional;
    this.parameters = parameters;
    this.returnType = returnType;
}


copy()
{
    return new NSMethod(
        this.location,
        this.baseName,
        this.isStatic,
        this.isOptional,
        this.parameters,
        this.returnType
    );
}


}

