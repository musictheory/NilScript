/*
    NSSymbolTyper.js
    Converts to/from names to compiler symbols
    Also converts to/from typechecker types
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _           = require("lodash");
const NSError     = require("../Errors").NSError;
const Utils       = require("../Utils");
const NSClass     = require("./NSClass");
const NSProtocol  = require("./NSProtocol");
const NSMethod    = require("./NSMethod");
const NSEnum      = require("./NSEnum");

const NSClassPrefix             = "N$_c_";
const NSProtocolPrefix          = "N$_p_";
const NSMethodPrefix            = "N$_f_";
const NSIvarPrefix              = "N$_i_";

const NSStaticClassPrefix       = "N$_C_";   // Typechecker only
const NSStaticProtocolPrefix    = "N$_P_";   // Typechecker only
const NSEnumPrefix              = "N$_e_";   // Typechecker only


const TypecheckerSymbols = {
    Combined:       "N$_Combined",
    StaticCombined: "N$_StaticCombined",

    Base:           "N$_BaseClass",
    StaticBase:     "N$_StaticBaseClass",

    IdIntersection: "N$_IdIntersection",
    IdUnion:        "N$_IdUnion",

    GlobalType:     "N$_Globals"
};

const Location = {
    DeclarationReturn:    "DeclarationReturn",
    DeclarationParameter: "DeclarationParameter",

    ImplementationReturn:     "ImplementationReturn",
    ImplementationParameter:  "ImplementationParameter"
};


const sBase52Digits = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";

function sToBase52(index)
{
    let result = "";
    let base = 52;

    do {
        result += sBase52Digits.charAt(index % base);
        index = Math.floor(index / base);
        base = 62;
    } while (index > 0);

    return result;
}


function sSymbolicate(string, fromSqueezedMap)
{
    return string.replace(/^N\$[A-Za-z0-9_$]+/g, function(symbol) {
        if (symbol.match(/^N\$_[cCpPi]_/)) {
            return symbol.substr(NSClassPrefix.length);

        } else if (fromSqueezedMap && symbol.indexOf("N$") === 0) {
            return fromSqueezedMap[symbol];

        } else if (symbol.indexOf(NSMethodPrefix) === 0) {
            symbol = symbol.substr(NSMethodPrefix.length);
            symbol = symbol.replace(/_([^_])/g, ":$1");
            symbol = symbol.replace(/_$/g,      ":");
            symbol = symbol.replace(/__/g,      "_");
            symbol = symbol.replace(/^\:/g,     "_");

            return symbol;

        } else {
            return symbol;
        }
    });
}


class NSSymbolTyper {


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
    let fromMap = this._fromSqueezedMap;
    let toMap   = this._toSqueezedMap;

    let squeezedName = toMap[readableName];
    let hasName = toMap.hasOwnProperty(readableName);

    if (!hasName && add) {
        while (!squeezedName) {
            let nameToTry = "N$" + sToBase52(this._squeezerId);
            if (!fromMap[nameToTry]) {
                squeezedName = nameToTry;
            }

            this._squeezerId++;

            if (this._maxSqueezerId && (this._squeezerId >= this._maxSqueezerId)) {
                Utils.throwError(NSError.SqueezerReachedEndIndex, "Squeezer reached max index of " + this._maxSqueezerId);
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
    let protocols = _.values(this._model.protocols);
    let enums     = _.values(this._model.enums);

    function addClassOrProtocol(name, instanceSymbol, staticSymbol) {
        toMap[name]             = instanceSymbol;
        toMap[instanceSymbol]   = instanceSymbol;
        toMap[staticSymbol]     = staticSymbol;

        fromMap[name]           = name;
        fromMap[instanceSymbol] = name;
        fromMap[staticSymbol]   = name;
    }

    for (let i = 0, length = classes.length; i < length; i++) {
        let name = classes[i].name;

        addClassOrProtocol(
            name, 
            this.getSymbolForClassName(name, false),
            this.getSymbolForClassName(name, true)
        );
    }

    for (let i = 0, length = protocols.length; i < length; i++) {
        let name = protocols[i].name;

        addClassOrProtocol(
            name, 
            this.getSymbolForProtocolName(name, false),
            this.getSymbolForProtocolName(name, true)
        );
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

    fromMap[TypecheckerSymbols.Base] = "NilScript.BaseObject";
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



_parseTypeString(inString)
{
    let tokens = inString.match(/[A-Za-z0-9$_]+|[<>,]/g);
    let next   = tokens[0];

    function lex() {
        let result = tokens.shift();
        next = tokens[0];
        return result;
    }

    function err() {
        throw new Error();
    }

    function parse() {
        let args = null;

        let name = lex();
        if (name == "async" || name == "kindof") {
            name = "-" + name;
            args = [ parse() ];

        } else if (name && name.match(/^[A-Za-z0-9$_]+/)) {
            if (next == "<") {
                lex();
                args = [ ];

                while (next) {
                    args.push(parse());

                    if (next == ",") {
                        lex();
                    } else {
                        break;
                    }
                }

                if (next == ">") {
                    lex();
                } else {
                    err();
                }
            }

        } else {
            throw new Error();
        }

        return { name, args };
    }

    return parse();
}


toTypecheckerType(rawInType, location)
{
    if (!rawInType) return "any";

    if (!this._toTypecheckerMap) {
        this._setupTypecheckerMaps();
    }

    let self  = this;
    let model = this._model;
    let toTypecheckerMap = this._toTypecheckerMap;

    // Check raw type string
    let outType = toTypecheckerMap[rawInType];
    if (outType) return outType;

    // Check normalized type string
    let inType = rawInType.replace(/(kindof|async)\s+/g, "$1-").replace(/\s+/g, ""); // Remove whitespace
    outType = toTypecheckerMap[inType];
    if (outType) return outType;

    let addToForwardMap = true;
    let addToReverseMap = true;

    function convert(node) {
        let name       = node.name;
        let args       = node.args || [ ];
        let argsLength = args.length;
        let tmp;

        if (name == "Array") {
            if (argsLength > 1) {
                throw new Error();

            } else if (argsLength == 1) {
                return convert(args[0]) + "[]";

            } else if (argsLength == 0) {
                return "any[]";
            }

        } else if (name == "Object") {
            if (argsLength > 1) {
                throw new Error();

            } else if (argsLength == 1) {
                return "{[i:string ]:" + convert(args[0]) + "}";

            } else if (argsLength == 0) {
                return "any";
            }

        } else if (name == "-kindof") {
            addToForwardMap = false;
            addToReverseMap = false;

            if ((location === Location.DeclarationReturn) || (location === Location.DefinitionParameter)) {
                // To fully support kindof, this should be replaced by an aggregate class
                return TypecheckerSymbols.IdIntersection;

            } else if ((location === Location.DeclarationParameter) || (location === Location.DefinitionReturn)) {
                return convert(args[0]);

            } else {
                return "any";
            }

        } else if (argsLength > 0) {
            return name + "<" + _.map(args, arg => convert(arg)).join(",") + ">";

        } else if (name == "id") {
            if (argsLength > 0) {
                throw new Error();
            }

            addToForwardMap = false;
            addToReverseMap = false;

            if ((location == Location.DeclarationReturn) || (location == Location.ImplementationParameter)) {
                return TypecheckerSymbols.IdIntersection;

            } else if ((location == Location.DeclarationParameter) || (location == Location.ImplementationReturn)) {
                return TypecheckerSymbols.IdUnion;

            } else {
                return "any";
            }

        } else if (name == "instancetype") {
            addToForwardMap = false;
            addToReverseMap = false;

            return "any";

        } else if (name == "String" || name == "string") {
            return "string";

        } else if ((tmp = toTypecheckerMap[name])) {
            return tmp;

        } else if (model.isNumericType(name)) {
            addToReverseMap = false;
            return "number";
            
        } else if (model.isBooleanType(name)) {
            addToReverseMap = false;
            return "boolean";

        } else if (name == "SEL") {
            return "N$_Selector";

        } else if (name == "Class" || name == "any") {
            return "any";

        } else if (name == "void") {
            return "void";

        } else {
            return name;
        }
    }

    try {
        outType = convert(this._parseTypeString(inType));
    } catch (e) {
        console.log(rawInType, inType)
        Utils.throwError(NSError.ParseError, "Cannot parse type '" + rawInType + "'");
    }

    if (outType) {
        if (addToForwardMap) {
            this._toTypecheckerMap[inType] = outType;
        }

        if (addToReverseMap) {
            let outTypeNoParenthesis = outType.replace(/[()]/g, ""); // Remove parenthesis

            if (!this._fromTypecheckerMap[outTypeNoParenthesis]) {
                this._fromTypecheckerMap[outTypeNoParenthesis] = inType;
            }
        }
    }

    return outType;
}


fromTypecheckerType(rawInType)
{
    if (!this._fromTypecheckerMap) {
        this._setupTypecheckerMaps();
    }

    let inType  = rawInType.replace(/[\s;]+/g, ""); // Remove whitespace and semicolon
    let outType = this._fromTypecheckerMap[inType];
    let m;

    if (!outType) {
        if (inType.indexOf(TypecheckerSymbols.Combined) >= 0 || inType.indexOf(TypecheckerSymbols.StaticCombined) >= 0) {
            outType = "id";

        } else if (inType.match(/\[\]$/)) {
            outType = "Array<" + this.fromTypecheckerType(inType.slice(0, -2)) + ">";

        } else if (m = inType.match(/\{\[(.*?):string\]\:(.*)\}$/)) {
            outType = "Object<" + this.fromTypecheckerType(m[2]) + ">";

        } else if (m = rawInType.match(/^typeof\s+(N\$_[cCpPi]_.*?\b)/)) {
            outType = this.fromTypecheckerType(m[1]);

        } else {
            outType = rawInType;
        }
    }

    return outType;
}


getSymbolicatedString(inString)
{
    return sSymbolicate(inString, this._fromSqueezedMap);
}


getSymbolForClassName(className, isTypecheckerStatic)
{
    let prefix = isTypecheckerStatic ? NSStaticClassPrefix : NSClassPrefix;

    if (!className) return;

    if (this._squeeze) {
        return this._getSqueezedSymbol(prefix + className, true);
    } else {
        return prefix + className;
    }

    return className;
}


getSymbolForEnumName(enumName)
{
    return NSEnumPrefix + enumName;
}


getSymbolForProtocolName(protocolName, isTypecheckerStatic)
{
    let prefix = isTypecheckerStatic ? NSStaticProtocolPrefix : NSProtocolPrefix;
    return prefix + protocolName;
}


getSymbolForSelectorName(selectorName)
{
    let replacedName = selectorName;
    replacedName = replacedName.replace(/_/g,   "__");
    replacedName = replacedName.replace(/^__/g, "_");
    replacedName = replacedName.replace(/\:/g,  "_");

    if (!Utils.isBaseObjectSelectorName(selectorName)) {
        if (this._squeeze) {
            return this._getSqueezedSymbol(NSMethodPrefix + replacedName, true);
        } else {
            return NSMethodPrefix + replacedName;
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


getSymbolForIvarName(ivarName)
{
    let result = NSIvarPrefix + ivarName;
    if (this._squeeze) result = this._getSqueezedSymbol(result, true);
    return result;
}



getAllSymbolsMap()
{
    return this._fromSqueezedMap;
}


}


NSSymbolTyper.TypecheckerSymbols = TypecheckerSymbols;
NSSymbolTyper.Location = Location;
NSSymbolTyper.symbolicate = sSymbolicate;

module.exports = NSSymbolTyper;
