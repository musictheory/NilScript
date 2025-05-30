/*
    Squeezer.js
    Converts to/from names to compiler symbols
    Also converts to/from typechecker types
    (c) 2013-2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import { CompilerIssue } from "./model/CompilerIssue.js";


const sBase62Digits = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";

function sToBase62(index)
{
    let result = "";

    do {
        result += sBase62Digits.charAt(index % 62);
        index = Math.floor(index / 62);
    } while (index > 0);

    return result;
}


const sCountMap = new Map();

export class Squeezer {

constructor(parents, start, max, builtins)
{
    this._id       = start;
    this._maxId    = max;
    this._builtins = new Set(builtins ?? [ ]);
    this._toMap    = new Map();            // key: symbol, value: squeezed symbol
    this._fromMap  = new Map();            // key: squeezed symbol, value: symbol

    if (parents) {
        parents.forEach(parent => this._inherit(parent));
    }
}


_inherit(parent)
{
    for (let [ key, value ] of parent._toMap) {
        this._addPair(key, value);
    }
}


_addPair(readableName, squeezedName)
{
    let fromMap = this._fromMap;
    let toMap   = this._toMap;

    let existing = this._toMap.get(readableName);
    if (existing && (existing != squeezedName)) {
        throw new CompilerIssue(`Squeezer conflict for '${readableName}': '${existing}' vs '${squeezedName}'`);
    }

    // if (fromMap.has(squeezedName)) {
    //     throw new CompilerIssue(`Squeezer conflict for '${readableName}': '${squeezedName}'`);
    // }    

    toMap.set(readableName, squeezedName);
    fromMap.set(squeezedName, readableName);

    return squeezedName;
}


_addName(readableName)
{
    if (this._builtins.has(readableName)) {
        return readableName;
    }

    let squeezedName = "N$" + sToBase62(this._id);
    this._id++;

    if (this._maxSqueezerId && (this._id >= this._maxSqueezerId)) {
        throw new CompilerIssue(`Squeezer reached max index of ${this._maxSqueezerId}`);
    } 
   
    return this._addPair(readableName, squeezedName);
}


getSqueezeMap()
{
    let result = Object.create(null);
    
    for (let [ key, value ] of this._fromMap.entries()) {
        result[key] = value;    
    }
    
    return result;
}


squeeze(name)
{
    return this._toMap.get(name) ?? this._addName(name);
}


unsqueeze(name)
{
    return this._fromMap.get(name) ?? name;
}


}


