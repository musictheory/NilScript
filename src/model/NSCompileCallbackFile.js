/*
    NSCompileCallbackFile.js
    Represents a file passed into the compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import { NSWarning  } from "../Errors.js";
import { Utils      } from "../Utils.js";


export class NSCompileCallbackFile {


constructor(path, lines, warnings)
{
    this._path     = path;
    this._lines    = lines || [ ];
    this._warnings = warnings || [ ];
}


setContents(contents)
{
    let newLines = contents ? contents.split("\n") : [ ];

    if (newLines.length > this._lines.length) {
        throw new Error("Line count mismatch: " + newLines.length + " vs. " + lines.length);
    }

    // Insert newlines, as babel likes to trim the end
    while (newLines.length < this._lines.length) {
        newLines.push("");
    }

    this._lines = newLines;
}


getContents()
{
    return this._lines ? this._lines.join("\n") : "";
}


getPath()
{
    return this._path;
}


addWarning(line, message)
{
    let warning = Utils.makeError(NSWarning.OnCompileFunction, message, line);
    Utils.addFilePathToError(this._path, warning);
    this._warnings.push(warning);
}


}
