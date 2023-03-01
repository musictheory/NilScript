/*
    NSFile.js
    Represents a file passed into the compiler
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const fs    = require("fs");
const Utils = require("../Utils");


module.exports = class NSFile {



constructor(path)
{
    this.path     = path;
    this.contents = null;
    this.time     = 0;

    this.needsAll();
}


updateFromDisk()
{
    let contents = fs.readFileSync(this.path).toString();
    let stats    = fs.statSync(this.path);
    let time     = stats.mtime.getTime();

    this.updateWithContentsAndTime(contents, time);
}


updateWithContentsAndTime(contents, time)
{
    if (time > this.time) {
        if (this.contents != contents) {
            this.contents = contents;
            this.time  = time;

            // A change in contents invalidates everything
            this.needsAll();
        }
    }
}


needsAll()
{
    this.needsPreprocess = true;
    this.needsParse();
}


needsParse()
{
    this.ast = null;
    this.needsBuild();
}


needsBuild()
{
    this.usage        = null;
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
    this.typecheckerCode  = null;
    this.typecheckerDefs  = null;
}


set error(err)
{
    if (err) Utils.addFilePathToError(this.path, err);
    this._error = err;
}


get error()
{
    return this._error;
}


}
