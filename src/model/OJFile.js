/*
    OJMethod.js
    Simple model class for a method on a class or protocol
    (c) 2013-2015 musictheory.net, LLC
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

    this.invalidateAllResults();
}


updateFromDisk()
{
    var contents = fs.readFileSync(this.path);
    var stats    = fs.statSync(file);
    var time     = stats.mtime.getTime();

    updateWithContentsAndTime(contents, time);
}


updateWithContentsAndTime(contents, time)
{
    if (time > this.time) {
        if (contents != this.contents) {
            this.contents = contents;
            this.time = time;

            // A change in contents invalidates everything
            this.invalidateAllResults();
        }
    }
}


invalidateAllResults()
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
    this.typecheckerLines    = null;
    this.typecheckerDefs     = null;  
    this.typecheckerWarnings = null;
}


}
