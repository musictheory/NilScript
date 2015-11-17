/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _ = require("lodash");

const TypecheckerSymbols = require("../model/OJSymbolTyper").TypecheckerSymbols;
const Location           = require("../model/OJSymbolTyper").Location;


module.exports = class DefinitionMaker {


constructor(ojModel)
{
    this._model       = ojModel;
    this._symbolTyper = ojModel.getSymbolTyper();
}


_getProtocolList(verb, isStatic, rawProtocolNames)
{
    let symbolTyper = this._symbolTyper;

    let symbols = _.map(rawProtocolNames, protocolName => {
        return symbolTyper.getSymbolForProtocolName(protocolName, isStatic);
    });

    if (symbols.length) {
        return " " + verb + " " + symbols.join(",");
    }

    return "";
}


_getInstancetypeMethods(inClass)
{
    let model = this._model;

    let declaredMethods = { };
    let toReturn = [ ];
    let ojClass = inClass;

    while (ojClass) {
        let methods = ojClass.getAllMethods();

        _.each(methods, function(m) {
            let name = m.selectorType + m.selectorName;

            if (m.returnType == "instancetype") {
                if (!declaredMethods[name]) {
                    declaredMethods[name] = true;

                    if (ojClass != inClass) {
                        toReturn.push(m);
                    }
                }
            }
        });

        ojClass = model.classes[ojClass.superclassName];
    }

    return toReturn;
}


_getDeclarationForMethod(method, ojClass)
{
    let symbolTyper = this._symbolTyper;
    let methodName  = symbolTyper.getSymbolForSelectorName(method.selectorName);
    let parameters  = [ ];

    for (let i = 0, length = method.parameterTypes.length; i < length; i++) {
        let variableName  = method.variableNames[i] || ("a" + i);
        let parameterType = symbolTyper.toTypecheckerType(method.parameterTypes[i], Location.DeclarationParameter);

        parameters.push(variableName + " : " + parameterType);
    }

    let returnType = symbolTyper.toTypecheckerType(method.returnType, Location.DeclarationReturn, ojClass);

    return methodName + (method.optional ? "?" : "") + "(" + parameters.join(", ") + ") : " + returnType + ";";
}


_siftMethodDeclarations(allMethods, classMethodDeclarations, instanceMethodDeclarations, ojClass)
{
   _.each(allMethods, method => {
        var arr = (method.selectorType == "+") ? classMethodDeclarations : instanceMethodDeclarations;
        arr.push(this._getDeclarationForMethod(method, ojClass));
    });
}


_appendOJClass(lines, ojClass, classSymbol, staticSymbol)
{
    let symbolTyper = this._symbolTyper;

    let superSymbol       = ojClass.superclassName ? symbolTyper.getSymbolForClassName(ojClass.superclassName, false) : TypecheckerSymbols.Base;
    let superStaticSymbol = ojClass.superclassName ? symbolTyper.getSymbolForClassName(ojClass.superclassName, true)  : TypecheckerSymbols.StaticBase;

    let declareClass = "declare class " + classSymbol +
                       " extends " + superSymbol +
                       this._getProtocolList("implements", false, ojClass.protocolNames) +
                       " {";

    lines.push(
        declareClass,
        "static alloc() : " + classSymbol + ";",
        "class() : " + staticSymbol + ";",
        "static class() : " + staticSymbol + ";",
        "init()  : " + classSymbol + ";",
        "$oj_super() : " + superSymbol + ";",
        "static $oj_super() : " + superStaticSymbol + ";"
    );

    let methods = [ ].concat(ojClass.getAllMethods(), this._getInstancetypeMethods(ojClass));
    let classMethodDeclarations    = [ ];
    let instanceMethodDeclarations = [ ];

    this._siftMethodDeclarations(methods, classMethodDeclarations, instanceMethodDeclarations, ojClass);

    _.each(classMethodDeclarations,    decl => {  lines.push("static " + decl);  });
    _.each(instanceMethodDeclarations, decl => {  lines.push(            decl);  });

    _.each(ojClass.getAllIvars(), ojIvar => {
        lines.push(symbolTyper.getSymbolForIvar(ojIvar) + " : " +  symbolTyper.toTypecheckerType(ojIvar.type) + ";");
    });

    lines.push("}");

    let declareStatic = "declare class " + staticSymbol +
                        " extends " + superStaticSymbol +
                        this._getProtocolList("implements", true, ojClass.protocolNames) +
                        " {";

    lines.push(
        declareStatic,
        "alloc() : " + classSymbol  + ";",
        "class() : " + staticSymbol + ";",
        "$oj_super() : " + superStaticSymbol + ";"
    );

    _.each(classMethodDeclarations, decl => lines.push(decl) );

    lines.push("}");
}


_appendOJProtocol(lines, ojProtocol)
{
    let symbolTyper = this._symbolTyper;

    let protocolSymbol = symbolTyper.getSymbolForProtocolName(ojProtocol.name, false);
    let staticSymbol   = symbolTyper.getSymbolForProtocolName(ojProtocol.name, true);

    let classMethodDeclarations    = [ ];
    let instanceMethodDeclarations = [ ];

    this._siftMethodDeclarations(ojProtocol.getAllMethods(), classMethodDeclarations, instanceMethodDeclarations);

    lines.push("declare interface " + protocolSymbol + this._getProtocolList("extends", false, ojProtocol.protocolNames) + " {");

    _.each(instanceMethodDeclarations, decl => {
        lines.push(decl);
    });

    lines.push("}");

    lines.push("declare interface " + staticSymbol + this._getProtocolList("extends", true, ojProtocol.protocolNames) + " {");

    _.each(classMethodDeclarations, decl => {
        lines.push(decl);
    });

    lines.push("}");
}


_appendOJStruct(lines, ojStruct)
{
    let symbolTyper = this._symbolTyper;
    let structSymbol = symbolTyper.getSymbolForStructName(ojStruct.name);

    lines.push("declare interface " + structSymbol + "{");

    _.each(ojStruct.variables, variable => {
        lines.push(variable.name + " : " + symbolTyper.toTypecheckerType(variable.annotation));
    });

    lines.push("}");
}


_appendOJEnum(lines, ojEnum)
{
    // Anonymous enums are inlined
    if (!ojEnum.name || ojEnum.anonymous) return;

    lines.push("declare enum " + this._symbolTyper.getSymbolForEnumName(ojEnum.name) + " {");

    _.each(ojEnum.values, function(value, name) {
        lines.push(name + " = " + value + ",");
    });

    lines.push("}"); 
}


_appendOJGlobal(lines, ojGlobal)
{
    let symbolTyper = this._symbolTyper;

    let name        = symbolTyper.getSymbolForIdentifierName(ojGlobal.name);
    let annotation  = _.clone(ojGlobal.annotation);

    if (_.isArray(annotation)) {
        let line = name;
        let returnType = annotation.shift();

        line += "(" + _.map(annotation, function(a, index) {
            return "a" + index + ":" + symbolTyper.toTypecheckerType(a);
        }).join(",") + ")";

        line += " : " + symbolTyper.toTypecheckerType(returnType) + ";";

        lines.push(line);

    } else {
        lines.push(name + " : " + symbolTyper.toTypecheckerType(annotation) + ";");
    }
}


getFileDefinitions(ojFile)
{
    let model       = this._model;
    let symbolTyper = this._symbolTyper;

    let lines = [ ];

    _.each(ojFile.declarations.classes, name => {
        let ojClass = model.classes[name];

        let classSymbol  = symbolTyper.getSymbolForClassName(ojClass.name, false);
        let staticSymbol = symbolTyper.getSymbolForClassName(ojClass.name, true);

        this._appendOJClass(lines, ojClass, classSymbol, staticSymbol);
    });

    _.each(ojFile.declarations.protocols, name => {
        this._appendOJProtocol(lines, model.protocols[name]);
    });

    _.each(ojFile.declarations.structs, name => {
        this._appendOJStruct(lines, model.structs[name]);
    });

    _.each(ojFile.declarations.enums, name => {
        this._appendOJEnum(lines, model.enums[name]);
    });

    return lines.join("\n");
}


getGlobalDefinitions()
{
    let lines = [ ];

    let model       = this._model;
    let symbolTyper = this._symbolTyper;

    let classNames    = _.keys(model.classes);
    let classSymbols  = _.map(classNames, name => symbolTyper.getSymbolForClassName(name, false));
    let staticSymbols = _.map(classNames, name => symbolTyper.getSymbolForClassName(name, true ));

    lines.push("declare class " + TypecheckerSymbols.GlobalType + " {");
    _.each(model.globals, ojGlobal => {
        var name       = symbolTyper.getSymbolForIdentifierName(ojGlobal.name);
        var annotation = _.clone(ojGlobal.annotation);

        if (_.isArray(annotation)) {
            var line = name;
            var returnType = annotation.shift();

            line += "(" + _.map(annotation, function(a, index) {
                return "a" + index + ":" + symbolTyper.toTypecheckerType(a);
            }).join(",") + ")";

            line += " : " + symbolTyper.toTypecheckerType(returnType) + ";";

            lines.push(line);

        } else {
            lines.push(name + " : " + symbolTyper.toTypecheckerType(annotation) + ";");
        }
    });
    lines.push("}");

    this._appendOJClass( lines, model.getAggregateClass(), TypecheckerSymbols.Combined, TypecheckerSymbols.StaticCombined );
    classSymbols .unshift(TypecheckerSymbols.Combined);
    staticSymbols.unshift(TypecheckerSymbols.StaticCombined)

    lines.push("declare type " + TypecheckerSymbols.IdIntersection + " = " + classSymbols.join("&") + ";");
    lines.push("declare type " + TypecheckerSymbols.IdUnion        + " = " + classSymbols.join("|") + ";");

    return lines.join("\n");
}


}
