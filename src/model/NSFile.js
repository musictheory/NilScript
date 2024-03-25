/*
    NSFile.js
    Represents a file passed into the compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import fs from "node:fs";
import { Utils } from "../Utils.js";


export class NSFile {



constructor(path)
{
    this.path     = path;
    this.contents = null;
    this.time     = 0;
    this.imports  = [ ];
    this.exports  = [ ];

    this.contentsVersion  = 1;
    this.generatedVersion = 1;

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
            this.contentsVersion++;

            this.contents = contents;
            this.time  = time;

            // A change in contents invalidates everything
            this.needsAll();
        }
    }
}


addImport(name)
{
    this.imports.push(name);
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
    this.builder      = null;
    this.usage        = null;
    this.declarations = null;

    this.needsGenerate();
}


needsGenerate()
{
    this.generatedVersion++;
    this.generatedLines    = null;
    this.generatedWarnings = null;
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
