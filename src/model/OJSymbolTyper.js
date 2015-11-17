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
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";

var OJKindofClassPrefix       = "$oj_k_";   // Typechecker only
var OJStaticClassPrefix       = "$oj_C_";   // Typechecker only
var OJStaticProtocolPrefix    = "$oj_P_";   // Typechecker only
var OJStructPrefix            = "$oj_s_";   // Typechecker only
var OJEnumPrefix              = "$oj_e_";   // Typechecker only


var TypecheckerSymbols = {
    Combined:       "$oj_$Combined",
    StaticCombined: "$oj_$StaticCombined",

    Base:           "$oj_$Base",
    StaticBase:     "$oj_$StaticBase",

    IdIntersection: "$oj_$id_intersection",
    IdUnion:        "$oj_$id_union",

    GlobalType:     "$oj_$Globals"
};

var Location = {
    DeclarationReturn:    "DeclarationReturn",
    DeclarationParameter: "DeclarationParameter",

    ImplementationReturn:     "ImplementationReturn",
    ImplementationParameter:  "ImplementationParameter"
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


class OJSymbolTyper {


constructor(model)
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


setupSqueezer(start, max)
{
    this._squeeze         = true;
    this._squeezerId      = start;
    this._maxSqueezerId   = max;
    this._toSqueezedMap   = this._toSqueezedMap || { };
    this._fromSqueezedMap = this._fromSqueezedMap || { };
}


loadState(state)
{
    if (state.squeezer) {
        this._squeeze         = true;
        this._squeezerId      = state.squeezer.id   || 0;
        this._fromSqueezedMap = state.squeezer.from || { };
        this._toSqueezedMap   = state.squeezer.to   || { };
    }
}


saveState()
{
    return {
        squeezer: this._squeeze ? {
            from: this._fromSqueezedMap,
            to:   this._toSqueezedMap,
            id:   this._squeezerId
        } : null
    };
}


_getSqueezedSymbol(readableName, add)
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


_setupTypecheckerMaps()
{
    let toMap     = { };
    let fromMap   = { };
    let classes   = _.values(this._model.classes);
    let structs   = _.values(this._model.structs);
    let enums     = _.values(this._model.enums);

    for (let i = 0, length = classes.length; i < length; i++) {
        let className      = classes[i].name;
        let instanceSymbol = this.getSymbolForClassName(className, false);
        let staticSymbol   = this.getSymbolForClassName(className, true);

        toMap[className]      = instanceSymbol;
        toMap[instanceSymbol] = instanceSymbol;
        toMap[staticSymbol]   = staticSymbol;

        fromMap[className]      = className;
        fromMap[instanceSymbol] = className;
        fromMap[staticSymbol]   = className;
    }

    for (let i = 0, length = structs.length; i < length; i++) {
        let structName   = structs[i].name;
        let structSymbol = this.getSymbolForStructName(structName);

        toMap[structName]   = structSymbol;
        toMap[structSymbol] = structSymbol;

        fromMap[structName]   = structName;
        fromMap[structSymbol] = structName;
    }

    for (let i = 0, length = enums.length; i < length; i++) {
        let enumName = enums[i].name;
        if (!enumName || enums[i].anonymous) {
            continue;
        }

        let enumSymbol = this.getSymbolForEnumName(enumName);

        toMap[enumName]   = enumSymbol;
        toMap[enumSymbol] = enumSymbol;

        fromMap[enumName]   = enumName;
        fromMap[enumSymbol] = enumName;
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


enrollForSqueezing(name)
{
    if (this._squeeze) {
        this._getSqueezedSymbol(name, true);
    }
}


toTypecheckerType(rawInType, location, currentClass)
{
    if (!rawInType) return "any";

    if (!this._toTypecheckerMap) {
        this._setupTypecheckerMaps();
    }

    var self  = this;
    var model = this._model;
    var toTypecheckerMap = this._toTypecheckerMap;

    var inType  = rawInType.replace(/kindof\s+/, "kindof-").replace(/\s+/g, ""); // Remove whitespace
    var outType = toTypecheckerMap[inType];

    if (outType) return outType;

    // "Array<Array<String>>"" becomes [ "Array", "Array", "String" ]
    var inParts  = inType.replace(/\>/g, "").split("<");
    var addToForwardMap = true;
    var addToReverseMap = true;

    let _handleParts = (parts) => {
        var part = parts[0];
        var rest = parts.slice(1);
        var result;
        var tmp;

        if (rest.length > 0) {
            if (part == "Array") {
                result = _handleParts(rest) + "[]";

            } else if (part == "Object" && (rest.length > 0)) {
                result = "{[i:string ]:" + _handleParts(rest) + "}";

            } else if (part == "id" && (rest.length > 0)) {
                var protocolSymbols = [ TypecheckerSymbols.Base ];

                _.each(rest[0].split(","), function(protocol) {
                    protocolSymbols.push(self.getSymbolForProtocolName(protocol));
                });

                result = "(" + protocolSymbols.join("&") + ")";

            } else {
                Utils.throwError(OJError.ParseError, "Cannot parse type '" + rawInType + "'");
            }

        } else if (part == "String" || part == "string") {
            result = "string";

        } else if ((tmp = toTypecheckerMap[part])) {
            result = tmp;

        } else if (model.isNumericType(part)) {
            result = "number";
            addToReverseMap = false;

        } else if (model.isBooleanType(part)) {
            result = "boolean";
            addToReverseMap = false;

        } else if (part == "Array") {
            result = "any[]";

        } else if (part == "SEL") {
            result = "$oj_$SEL";

        } else if (part == "Object" || part == "Class" || part == "any") {
            result = "any";

        } else if (part == "void") {
            result = "void";

        } else if (part == "id") {
            if ((location == Location.DeclarationReturn) || (location == Location.ImplementationParameter)) {
                result = TypecheckerSymbols.IdIntersection;

            } else if ((location == Location.DeclarationParameter) || (location == Location.ImplementationReturn)) {
                result = TypecheckerSymbols.IdUnion;

            } else {
                result = "any";
            }

            addToForwardMap = false;
            addToReverseMap = false;

        } else if (part.indexOf("kindof-") == 0) {
            part = part.split("-")[1];

            if ((location === Location.DeclarationReturn) || (location === Location.DefinitionParameter)) {
                // To fully support kindof, this should be replaced by an aggregate class
                result = TypecheckerSymbols.IdIntersection;

            } else if ((location === Location.DeclarationParameter) || (location === Location.DefinitionReturn)) {
                result = _handleParts([ part ]);

            } else {
                result = "any";
            }

            addToForwardMap = false;
            addToReverseMap = false;

        } else if (part == "instancetype") {
            if (currentClass && currentClass.name) {
                result = _handleParts([ currentClass.name ]);
            } else {
                result = "any";
            }

            addToForwardMap = false;
            addToReverseMap = false;

        } else if ((tmp = model.types[part])) {
            if (tmp == part) {
                result = tmp;
            } else {
                result = this.toTypecheckerType(tmp, location);
                addToReverseMap = false;
            }

        } else {
            result = part;
        }
        
        return result;
    }

    outType = _handleParts(inParts);
    outType = outType.replace(/\s+/g, ""); // Remove whitespace

    if (addToForwardMap && outType) {
        this._toTypecheckerMap[inType] = outType;
    }

    if (addToReverseMap && outType) {
        var outTypeNoParenthesis = outType.replace(/[()]/g, ""); // Remove parenthesis

        if (!this._fromTypecheckerMap[outTypeNoParenthesis]) {
            this._fromTypecheckerMap[outTypeNoParenthesis] = inType;
        }
    }

    return outType;
}


fromTypecheckerType(rawInType)
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

        } else if (m = rawInType.match(/^typeof\s+(\$oj_[cCpPi]_.*?\b)/)) {
            outType = this.fromTypecheckerType(m[1]);

        } else {
            outType = rawInType;
        }
    }

    return outType;
}


getSymbolicatedString(inString)
{
    var fromSqueezedMap = this._fromSqueezedMap;

    return inString.replace(/\$oj[_$][A-Za-z_$]+/g, function(symbol) {
        if (symbol.indexOf("$oj$") === 0) {
            return fromSqueezedMap[symbol];

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


getSymbolForClassName(className, isTypecheckerStatic)
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


getSymbolForStructName(structName)
{
    return OJStructPrefix + structName;
}


getSymbolForEnumName(enumName)
{
    return OJEnumPrefix + enumName;
}


getSymbolForProtocolName(protocolName, isTypecheckerStatic)
{
    var prefix = isTypecheckerStatic ? OJStaticProtocolPrefix : OJProtocolPrefix;
    return prefix + protocolName;
}


getSymbolForSelectorName(selectorName)
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


getSymbolForIdentifierName(name)
{
    if (this._squeeze) {
        return this._getSqueezedSymbol(name, false);
    } else {
        return name;
    }
}


getSymbolForClassNameAndIvarName(className, ivarName)
{
    var result = OJIvarPrefix + className + "$" + ivarName;
    if (this._squeeze) result = this._getSqueezedSymbol(result, true);
    return result;
}


getSymbolForIvar(ivar)
{
    return this.getSymbolForClassNameAndIvarName(ivar.className, ivar.name);
}


}


OJSymbolTyper.TypecheckerSymbols = TypecheckerSymbols;
OJSymbolTyper.Location = Location;

module.exports = OJSymbolTyper;
