/*
    OJSymbolTyper.js
    Converts to/from names to compiler symbols
    Also converts to/from typechecker types
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var _           = require("lodash");
var OJError     = require("../errors").OJError;
var Utils       = require("../utils");
var OJClass     = require("./OJClass");
var OJProtocol  = require("./OJProtocol");
var OJMethod    = require("./OJMethod");
var OJEnum      = require("./OJEnum");

var OJClassPrefix             = "$oj_c_";
var OJProtocolPrefix          = "$oj_p_";
var OJStaticClassPrefix       = "$oj_C_";   // Typechecker only
var OJStaticProtocolPrefix    = "$oj_P_";   // Typechecker only
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";

var TypecheckerSymbols = {
    Combined:       "$oj_$Combined",
    StaticCombined: "$oj_$StaticCombined",

    Base:           "$oj_$Base",
    StaticBase:     "$oj_$StaticBase",

    IdIntersection: "$oj_$id_intersection",
    IdUnion:        "$oj_$id_union",

    GlobalType:     "$oj_$Globals"
};


var sBase52Digits = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";

function sToBase52(index)
{
    var result = "";
    var base = 52;

    do {
        result += sBase52Digits.charAt(index % base);
        index = Math.floor(index / base);
        base = 62;
    } while (index > 0);

    return result;
}


function OJSymbolTyper(model)
{
    this._model           = model;
    this._squeeze         = false;
    this._squeezerId      = 0;
    this._maxSqueezerId   = 0;
    this._toSqueezedMap   = { };            // key: symbol, value: squeezed symbol
    this._fromSqueezedMap = { };            // key: squeezed symbol, value: symbol

    this._toTypecheckerMap   = null;
    this._fromTypecheckerMap = null;
}


OJSymbolTyper.prototype.setupSqueezer = function(start, max)
{
    this._squeeze         = true;
    this._squeezerId      = start;
    this._maxSqueezerId   = max;
    this._toSqueezedMap   = this._toSqueezedMap || { };
    this._fromSqueezedMap = this._fromSqueezedMap || { };
}


OJSymbolTyper.prototype._getSqueezedSymbol = function(readableName, add)
{
    var fromMap = this._fromSqueezedMap;
    var toMap   = this._toSqueezedMap;

    var squeezedName = toMap[readableName];
    var hasName = toMap.hasOwnProperty(readableName);

    if (!hasName && add) {
        while (!squeezedName) {
            var nameToTry = "$oj$" + sToBase52(this._squeezerId);
            if (!fromMap[nameToTry]) {
                squeezedName = nameToTry;
            }

            this._squeezerId++;

            if (this._maxSqueezerId && (this._squeezerId >= this._maxSqueezerId)) {
                Utils.throwError(OJError.SqueezerReachedEndIndex, "Squeezer reached max index of " + this._maxSqueezerId);
            }
        }

        toMap[readableName]   = squeezedName;
        fromMap[squeezedName] = readableName;
        hasName = true;
    }

    return hasName ? squeezedName : undefined;
}


OJSymbolTyper.prototype.loadState = function(state)
{
    if (state.squeezer) {
        this._squeeze         = true;
        this._squeezerId      = state.squeezer.id   || 0;
        this._fromSqueezedMap = state.squeezer.from || { };
        this._toSqueezedMap   = state.squeezer.to   || { };
    }
}


OJSymbolTyper.prototype.saveState = function()
{
    return {
        squeezer: this._squeeze ? {
            from: this._fromSqueezedMap,
            to:   this._toSqueezedMap,
            id:   this._squeezerId
        } : null
    };
}


OJSymbolTyper.prototype._setupTypecheckerMaps = function()
{
    var toMap     = { };
    var fromMap   = { };
    var classes   = _.values(this._model.classes);

    for (var i = 0, length = classes.length; i < length; i++) {
        var className      = classes[i].name;
        var instanceSymbol = this.getSymbolForClassName(className, false);
        var staticSymbol   = this.getSymbolForClassName(className, true);

        toMap[className]      = instanceSymbol;
        toMap[instanceSymbol] = instanceSymbol;
        toMap[staticSymbol]   = staticSymbol;

        fromMap[className]      = className;
        fromMap[instanceSymbol] = className;
        fromMap[staticSymbol]   = className;
    }

    _.extend(fromMap, {
        "any":              "any",
        "any[]":            "Array",
        "{}":               "Object",
        "undefined[]":      "Array",
        "boolean":          "BOOL",
        "number":           "Number",
        "string":           "String"
    });

    fromMap[TypecheckerSymbols.Base] = "OJ.BaseObject";
    fromMap[TypecheckerSymbols.StaticBase] = "Class";

    this._toTypecheckerMap   = toMap;
    this._fromTypecheckerMap = fromMap;
}


OJSymbolTyper.prototype._getBracketedType = function(inType, currentClass)
{
    var self = this;

    // "Array<Array<String>>"" becomes [ "Array", "Array", "String" ]
    var inParts = inType.replace(/\>/g, "").split("<");

    function getStringWithSegments(segments) {
        var first = segments[0];
        var rest  = segments.slice(1);

        if (first == "Array") {
            return getStringWithSegments(rest) + "[]";

        } else if (first == "Object" && (rest.length > 0)) {
            return "{[i:string ]:" + getStringWithSegments(rest) + "}";

        } else if (first == "id" && (rest.length > 0)) {
            var protocolSymbols = [ TypecheckerSymbols.Base ];

            _.each(rest[0].split(","), function(protocol) {
                protocolSymbols.push(self.getSymbolForProtocolName(protocol));
            });

            return protocolSymbols.join("&");

        } else {
            return self.toTypecheckerType(first, currentClass);
        }
    }

    var outType = getStringWithSegments(inParts);

    return outType;
}


OJSymbolTyper.prototype.enrollForSqueezing = function(name)
{
    if (this._squeeze) {
        this._getSqueezedSymbol(name, true);
    }
}


OJSymbolTyper.prototype.toTypecheckerType = function(rawInType, currentClass)
{
    if (!rawInType) return "any";

    if (!this._toTypecheckerMap) {
        this._setupTypecheckerMaps();
    }

    var tmp;
    var outType;
    var addToMap = true;

    var inType  = rawInType.replace(/\s+/g, ""); // Remove whitespace
    var outType = this._toTypecheckerMap[inType];

    if (outType) return outType;

    if (inType == "String" || inType == "string") {
        outType = "string";

    } else if (this._model.isNumericType(inType)) {
        outType = "number";

    } else if (this._model.isBooleanType(inType)) {
        outType = "boolean";

    } else if (inType == "Array") {
        outType = "any[]";

    } else if (inType == "SEL") {
        outType = "$oj_$SEL";

    } else if (inType == "Object" || inType == "Class" || inType == "any" || inType == "id") {
        outType = "any";

    } else if (inType == "void") {
        outType = "void";

    } else if (inType == "instancetype") {
        addToMap = false;

        if (currentClass && currentClass.name) {
            outType = this.toTypecheckerType(currentClass.name);
        } else {
            outType = "any";
        }

    } else if ((tmp = this._model.types[inType])) {
        if (tmp == inType) {
            outType = tmp;
        } else {
            outType = this.toTypecheckerType(tmp);
        }

    } else if (inType.indexOf("<") >= 0) {
        outType = this._getBracketedType(inType);

    } else {
        outType = inType;
    }

    outType = outType.replace(/\s+/g, ""); // Remove whitespace

    if (addToMap && outType) {
        this._toTypecheckerMap[inType] = outType;

        if (!this._fromTypecheckerMap[outType]) {
            this._fromTypecheckerMap[outType] = inType;
        }
    }

    return outType;
}


OJSymbolTyper.prototype.fromTypecheckerType = function(rawInType)
{
    if (!this._fromTypecheckerMap) {
        this._setupTypecheckerMaps();
    }

    var inType  = rawInType.replace(/[\s;]+/g, ""); // Remove whitespace and semicolon
    var outType = this._fromTypecheckerMap[inType];
    var m;

    if (!outType) {
        if (inType.indexOf(TypecheckerSymbols.Combined) >= 0 || inType.indexOf(TypecheckerSymbols.StaticCombined) >= 0) {
            outType = "id";
        } else if (inType.match(/\[\]$/)) {
            outType = "Array<" + this.fromTypecheckerType(inType.slice(0, -2)) + ">";

        } else if (m = inType.match(/\{\[(.*?):string\]\:(.*)\}$/)) {
            outType = "Object<" + this.fromTypecheckerType(m[2]) + ">";

        } else {
            outType = rawInType;
        }
    }

    return outType;
}


OJSymbolTyper.prototype.getSymbolicatedString = function(inString)
{
    return inString.replace(/\$oj[_$][A-Za-z_$]+/g, function(symbol) {
        if (symbol.indexOf("$oj$") === 0) {
            return this._fromSqueezedMap[symbol];

        } else if (symbol.match(/^\$oj_[cCpPi]_/)) {
            return symbol.substr(OJClassPrefix.length);

        } else if (symbol.indexOf(OJMethodPrefix) === 0) {
            symbol = symbol.substr(OJMethodPrefix.length);
            symbol = symbol.replace(/_([^_])/g, ":$1");
            symbol = symbol.replace(/_$/g,      ":");
            symbol = symbol.replace(/__/g,    "_");
            symbol = symbol.replace(/^\:/g,   "_");

            return symbol;

        } else {
            return symbol;
        }
    });
}


OJSymbolTyper.prototype.getSymbolForProtocolName = function(protocolName, isTypecheckerStatic)
{
    var prefix = isTypecheckerStatic ? OJStaticProtocolPrefix : OJProtocolPrefix;
    return prefix + protocolName;
}


OJSymbolTyper.prototype.getSymbolForClassName = function(className, isTypecheckerStatic)
{
    var prefix = isTypecheckerStatic ? OJStaticClassPrefix : OJClassPrefix;

    if (!className) return;

    if (!Utils.isBaseObjectClass(className)) {
        if (this._squeeze) {
            return this._getSqueezedSymbol(prefix + className, true);
        } else {
            return prefix + className;
        }
    }

    return className;
}


OJSymbolTyper.prototype.getSymbolForSelectorName = function(selectorName)
{
    var replacedName = selectorName;
    replacedName = replacedName.replace(/_/g,   "__");
    replacedName = replacedName.replace(/^__/g, "_");
    replacedName = replacedName.replace(/\:/g,  "_");

    if (!Utils.isBaseObjectSelectorName(selectorName)) {
        if (this._squeeze) {
            return this._getSqueezedSymbol(OJMethodPrefix + replacedName, true);
        } else {
            return OJMethodPrefix + replacedName;
        }
    }

    return replacedName;
}


OJSymbolTyper.prototype.getSymbolForIdentifierName = function(name)
{
    if (this._squeeze) {
        return this._getSqueezedSymbol(name, false);
    } else {
        return name;
    }
}


OJSymbolTyper.prototype.getSymbolForClassNameAndIvarName = function(className, ivarName)
{
    var result = OJIvarPrefix + className + "$" + ivarName;
    if (this._squeeze) result = this._getSqueezedSymbol(result, true);
    return result;
}


OJSymbolTyper.prototype.getSymbolForIvar = function(ivar)
{
    return this.getSymbolForClassNameAndIvarName(ivar.className, ivar.name);
}

OJSymbolTyper.TypecheckerSymbols = TypecheckerSymbols;

module.exports = OJSymbolTyper;
