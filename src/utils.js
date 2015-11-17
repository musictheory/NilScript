/*
    utils.js
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _      = require("lodash");
const mkdirp = require("mkdirp");
const path   = require("path");
const fs     = require("fs");


function isJScriptReservedWord(id)
{
    switch (id.length) {
    case 2:  return (id === 'if')       || (id === 'in')       || (id === 'do');
    case 3:  return (id === 'var')      || (id === 'for')      || (id === 'new')    ||
                    (id === 'try')      || (id === 'let');
    case 4:  return (id === 'this')     || (id === 'else')     || (id === 'case')   ||
                    (id === 'void')     || (id === 'with')     || (id === 'enum');
    case 5:  return (id === 'while')    || (id === 'break')    || (id === 'catch')  ||
                    (id === 'throw')    || (id === 'const')    || (id === 'yield')  ||
                    (id === 'class')    || (id === 'super');
    case 6:  return (id === 'return')   || (id === 'typeof')   || (id === 'delete') ||
                    (id === 'switch')   || (id === 'export')   || (id === 'import');
    case 7:  return (id === 'default')  || (id === 'finally')  || (id === 'extends');
    case 8:  return (id === 'function') || (id === 'continue') || (id === 'debugger');
    case 10: return (id === 'instanceof');
    default:
        return false;
    }
}


var sBaseObjectSelectors = {
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


var sRuntimeReservedSelectors = {
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


function makeError(name, message, node)
{
    var error = new Error(message);

    error.file    = null;
    error.line    = node ? node.loc.start.line : 0;
    error.column  = node ? node.loc.start.col  : 0;
    error.name    = name;
    error.reason  = message;

    return error;
}


function throwError(name, message, node)
{
    throw makeError(name, message, node);
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


function rmrf(dir)
{
    try {
        _.each(fs.readdirSync(dirPath), file => {
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
    isJScriptReservedWord:      isJScriptReservedWord,
    isReservedSelectorName:     isReservedSelectorName,
    isBaseObjectSelectorName:   isBaseObjectSelectorName,
    getBaseObjectSelectorNames: getBaseObjectSelectorNames,
    isBaseObjectClass:          isBaseObjectClass,
    makeError:                  makeError,
    throwError:                 throwError,
    addNodeToError:             addNodeToError,
    addFilePathToError:         addFilePathToError,

    rmrf:                       rmrf,
    mkdirAndWriteFile:          mkdirAndWriteFile
};
