/*
    Utils.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _    from "lodash";
import path from "node:path";
import fs   from "node:fs";
import { fileURLToPath } from "node:url";

const sBaseObjectSelectors = {
    "alloc": 1,
    "class": 1,
    "className": 1,
    "instancesRespondToSelector:": 1,
    "isKindOfClass:": 1,
    "isMemberOfClass:": 1,
    "isSubclassOfClass:": 1,
    "performSelector:": 1,
    "performSelector:withObject:": 1,
    "performSelector:withObject:withObject:": 1,
    "respondsToSelector:": 1,
    "superclass": 1,

    // Reserved for https://github.com/musictheory/NilScript/issues/151
    "iterator": 1,

    // Subclasses may override these
    "copy":        2,
    "description": 2,
    "init":        2,
    "isEqual:":    2,
    "toString":    2,
    "toJSON":      2,
    "valueOf":     2
};


function isReservedSelectorName(name)
{
    return sBaseObjectSelectors[name] == 1;
}


function isBaseObjectSelectorName(name)
{
    return !!sBaseObjectSelectors[name];
}


function getBaseObjectSelectorNames()
{
    return _.keys(sBaseObjectSelectors);
}


function makeError(name, message, arg)
{
    let error = new Error(message);
    let path = null;
    let line, column;

    if (_.isObject(arg) && arg.loc && arg.loc.start) {
        line   = arg.loc.start.line;
        column = arg.loc.start.col;

    } else if (_.isObject(arg) && arg.path) {
        path   = arg.path;
        line   = arg.line;
        column = arg.column;

    } else if (_.isString(arg)) {
        line = parseInt(arg, 10);

    } else if (_.isNumber(arg)) {
        line = arg;
    }

    error.file    = path;
    error.line    = line;
    error.column  = column;
    error.name    = name;
    error.reason  = message;

    return error;
}


function throwError(name, message)
{
    throw makeError.apply(null, _.toArray(arguments));
}


function addNodeToError(node, error)
{
    if (node) {
        if (!error.line) {
            error.line    = node.loc.start.line;
            error.column  = node.loc.start.col;
        }
    }
}


function addFilePathToError(file, error)
{
    if (!error.file) {
        error.file = file;
    }
}



let sShouldLog = false;

function enableLog()
{
    sShouldLog = true;
}


function log()
{
    if (!sShouldLog) return;
    console.log.apply(this, _.toArray(arguments));
}


function rmrf(dir)
{
    try {
        _.each(fs.readdirSync(dir), file => {
            file = dir + path.sep + file;
            if (fs.statSync(file).isFile()) {
                fs.unlinkSync(file)
            } else {
                rmrf(file);
            }
        });

        fs.rmdirSync(dir);
    } catch(e) { }
}


function mkdirAndWriteFile(file, contents)
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}


function getProjectPath(file)
{
    let base = fileURLToPath(new URL("..", import.meta.url));
    return path.resolve(base, file);
}


export const Utils = {
    isReservedSelectorName,
    isBaseObjectSelectorName,
    getBaseObjectSelectorNames,
    makeError,
    throwError,
    addNodeToError,
    addFilePathToError,

    getProjectPath,

    enableLog,
    log,

    rmrf,
    mkdirAndWriteFile
};
