/*
    OJMethod.js
    Simple model class for a method on a class or protocol
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var fs = require("fs");


module.exports = class OJFile {


constructor(path)
{
    this.path     = path;
    this.contents = null;
    this.time     = 0;

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
    this.ast    = null;
    this.jsCode = null;
    this.tsCode = null;
    this.tsDefs = null;  

    this.parseError = null;
}


}
