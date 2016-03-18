/*
    OJFile.js
    Represents a file passed into the compiler
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const fs = require("fs");


module.exports = class OJFile {


constructor(path)
{
    this.path     = path;
    this.contents = null;
    this.time     = 0;

    this.calls    = null;

    this.needsAll();
}


updateFromDisk()
{
    var contents = fs.readFileSync(this.path).toString();
    var stats    = fs.statSync(this.path);
    var time     = stats.mtime.getTime();

    this.updateWithContentsAndTime(contents, time);
}


updateWithContentsAndTime(contents, time)
{
    if (time > this.time) {
        if (contents != this.contents) {
            this.contents = contents;
            this.time  = time;
            this.error = null;

            // A change in contents invalidates everything
            this.needsAll();
        }
    }
}


needsAll()
{
    this.needsParse();
}


needsParse()
{
    this.ast = null;
    this.needsBuild();
}


needsBuild()
{
    this.usage = null;
    this.declarations = null;

    this.needsGenerate();
    this.needsTypecheck();
}


needsGenerate()
{
    this.generatorLines    = null;
    this.generatorWarnings = null;
}


needsTypecheck()
{
    this.typecheckerCode = null;
    this.typecheckerDefs = null;  
}


}
