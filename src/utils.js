/*
    utils.js
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _      = require("lodash");
const mkdirp = require("mkdirp");
const path   = require("path");
const fs     = require("fs");


const sBaseObjectSelectors = {
    "alloc": 1,
    "class": 1,
    "className": 1,
    "copy": 1,
    "description": 1,
    "init": 1,
    "initialize": 1,
    "instancesRespondToSelector:": 1,
    "isEqual:": 1,
    "isKindOfClass:": 1,
    "isMemberOfClass:": 1,
    "isSubclassOfClass:": 1,
    "load": 1,
    "performSelector:": 1,
    "performSelector:withObject:": 1,
    "performSelector:withObject:withObject:": 1,
    "respondsToSelector:": 1,
    "superclass": 1,
    "toString": 1
};


const sRuntimeReservedSelectors = {
    "alloc": 1,
    "class": 1,
    "className": 1,
    "instancesRespondToSelector:": 1,
    "respondsToSelector:": 1,
    "superclass": 1,
    "isSubclassOfClass:": 1,
    "isKindOfClass:": 1,
    "isMemberOfClass:": 1
};


function isReservedSelectorName(name)
{
    return !!sRuntimeReservedSelectors[name];
}


function isBaseObjectSelectorName(name)
{
    return !!sBaseObjectSelectors[name];
}


function getBaseObjectSelectorNames()
{
    return _.keys(sBaseObjectSelectors);
}


function isBaseObjectClass(name)
{
    return name == "BaseObject";
}


function makeError(name, message, arg)
{
    let error = new Error(message);
    let line, column;

    if (_.isObject(arg) && arg.loc && arg.loc.start) {
        line   = arg.loc.start.line;
        column = arg.loc.start.col;

    } else if (_.isString(arg)) {
        line = parseInt(arg, 10);

    } else if (_.isNumber(arg)) {
        line = arg;
    }

    error.file    = null;
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
    mkdirp.sync(path.dirname(file));
    fs.writeFileSync(file, contents);
}


module.exports = {
    isReservedSelectorName:     isReservedSelectorName,
    isBaseObjectSelectorName:   isBaseObjectSelectorName,
    getBaseObjectSelectorNames: getBaseObjectSelectorNames,
    isBaseObjectClass:          isBaseObjectClass,
    makeError:                  makeError,
    throwError:                 throwError,
    addNodeToError:             addNodeToError,
    addFilePathToError:         addFilePathToError,

    enableLog: enableLog,
    log: log,

    rmrf:                       rmrf,
    mkdirAndWriteFile:          mkdirAndWriteFile
};
