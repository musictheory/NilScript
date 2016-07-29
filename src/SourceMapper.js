/*
    SourceMapper.js
    Wraps SourceMapGenerator to generate source maps
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const SourceMapGenerator = require && require("source-map").SourceMapGenerator;


module.exports = class SourceMapper {

constructor(files, sourceRoot)
{
    this._generator = new SourceMapGenerator({ 
        file:       files,
        sourceRoot: sourceRoot
    });

    this._outLine = 1;
}


add(name, lines)
{
    if (!lines) {
        console.log(name, lines);
        return;
    }

    if (name) {
        for (let i = 1, length = lines.length; i <= length; i++) {
            this._generator.addMapping({
                source: name,
                original:  { line: i,               column: 0 },
                generated: { line: this._outLine++, column: 0 }
            });
        }

    } else {
        this._outLine += lines.length;
    }
}


getSourceMap()
{
    return this._generator.toString();
}


}
