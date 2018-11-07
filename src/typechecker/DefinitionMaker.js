/*
    DefinitionMaker.js
    Responsible for generating TypeScript definition files for NilScript model objects
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _ = require("lodash");

const TypecheckerSymbols = require("../model/NSSymbolTyper").TypecheckerSymbols;
const Location           = require("../model/NSSymbolTyper").Location;
const NSType             = require("../model/NSType");


module.exports = class DefinitionMaker {


constructor(model)
{
    this._model       = model;
    this._symbolTyper = model.getSymbolTyper();
}


_getProtocolList(verb, isStatic, rawProtocolNames)
{
    let symbolTyper = this._symbolTyper;

    let symbols = _.map(rawProtocolNames, protocolName => {
        return symbolTyper.getSymbolForProtocolName(protocolName, isStatic);
    });

    symbols.unshift(isStatic ? "N$_StaticBaseProtocol" : "N$_BaseProtocol");

    if (symbols.length) {
        return " " + verb + " " + symbols.join(",");
    }

    return "";
}


_getDeclarationForMethod(method)
{
    let symbolTyper = this._symbolTyper;
    let methodName  = symbolTyper.getSymbolForSelectorName(method.selectorName);
    let parameters  = [ ];

    for (let i = 0, length = method.parameterTypes.length; i < length; i++) {
        let variableName  = method.variableNames[i] || ("a" + i);
        let parameterType = symbolTyper.toTypecheckerType(method.parameterTypes[i], Location.DeclarationParameter);

        parameters.push(variableName + " : " + parameterType);
    }

    let returnType = symbolTyper.toTypecheckerType(method.returnType, Location.DeclarationReturn);

    return methodName + (method.optional ? "?" : "") + "(" + parameters.join(", ") + ") : " + returnType + ";";
}


_siftMethodDeclarations(methods, classMethodDeclarations, instanceMethodDeclarations)
{
    _.each(methods, method => {
        let arr = (method.selectorType == "+") ? classMethodDeclarations : instanceMethodDeclarations;
        arr.push(this._getDeclarationForMethod(method));
    });
}


_appendClass(lines, nsClass, classSymbol, staticSymbol)
{
    let symbolTyper = this._symbolTyper;

    let superSymbol       = nsClass.superclassName ? symbolTyper.getSymbolForClassName(nsClass.superclassName, false) : TypecheckerSymbols.Base;
    let superStaticSymbol = nsClass.superclassName ? symbolTyper.getSymbolForClassName(nsClass.superclassName, true)  : TypecheckerSymbols.StaticBase;

    let declaredMethodNames = { };
    let methods = [ ];

    function addMethod(method) {
        if (!method) return;

        let name = method.selectorType + method.selectorName;
        if (declaredMethodNames[name]) return;

        if (method.returnType == "instancetype") {
            method = method.copy();
            method.returnType = nsClass.name;
        }

        declaredMethodNames[name] = true;
        methods.push(method);
    }

    // Add all methods defined by this class
    _.each(nsClass.getAllMethods(), method => {
        addMethod(method)
    });

    // Add properties at this level, if needed
    _.each(nsClass.getAllProperties(), property => {
        addMethod(property.generateGetterMethod());
        addMethod(property.generateSetterMethod());
    });

    // Walk hierarchy and add any method with a returnType of "instancetype"
    {
        let superclass = nsClass.superclass;

        while (superclass) {
            _.each(superclass.getAllMethods(), method => {
                if (method.returnType == "instancetype") {
                    addMethod(method);
                }
            });

            superclass = superclass.superclass;
        }
    }

    let classMethodDeclarations    = [ ];
    let instanceMethodDeclarations = [ ];

    this._siftMethodDeclarations(methods, classMethodDeclarations, instanceMethodDeclarations);

    lines.push(
        "declare class " + classSymbol +
            " extends " + superSymbol +
            this._getProtocolList("implements", false, nsClass.protocolNames) +
            " {"
    );

    _.each(classMethodDeclarations,    decl => {  lines.push("static " + decl);  });
    _.each(instanceMethodDeclarations, decl => {  lines.push(            decl);  });

    _.each(nsClass.getAllIvars(), ivar => {
        lines.push(symbolTyper.getSymbolForIvarName(ivar.name) + " : " +  symbolTyper.toTypecheckerType(ivar.type) + ";");
    });

    lines.push(
        "static alloc() : " + classSymbol + ";",
        "class() : " + staticSymbol + ";",
        "static class() : " + staticSymbol + ";",
        "init()  : " + classSymbol + ";",
        "N$_super() : " + superSymbol + ";",
        "static N$_super() : " + superStaticSymbol + ";",
        "}"
    );

    lines.push(
        "declare class " + staticSymbol +
            " extends " + superStaticSymbol +
            this._getProtocolList("implements", true, nsClass.protocolNames) +
            " {"
    );

    _.each(classMethodDeclarations, decl => lines.push(decl) );

    lines.push(
        "alloc() : " + classSymbol  + ";",
        "class() : " + staticSymbol + ";",
        "N$_super() : " + superStaticSymbol + ";",
        "}"
    );
}


_appendProtocol(lines, nsProtocol)
{
    let symbolTyper = this._symbolTyper;

    let protocolSymbol = symbolTyper.getSymbolForProtocolName(nsProtocol.name, false);
    let staticSymbol   = symbolTyper.getSymbolForProtocolName(nsProtocol.name, true);

    let classMethodDeclarations    = [ ];
    let instanceMethodDeclarations = [ ];

    this._siftMethodDeclarations(nsProtocol.getAllMethods(), classMethodDeclarations, instanceMethodDeclarations);

    lines.push("declare interface " + protocolSymbol + this._getProtocolList("extends", false, nsProtocol.protocolNames) + " {");

    _.each(instanceMethodDeclarations, decl => {
        lines.push(decl);
    });

    lines.push("}");

    lines.push("declare interface " + staticSymbol + this._getProtocolList("extends", true, nsProtocol.protocolNames) + " {");

    _.each(classMethodDeclarations, decl => {
        lines.push(decl);
    });

    lines.push("}");
}


_appendType(lines, nsType)
{
    let symbolTyper = this._symbolTyper;

    let name = nsType.name;
    let kind = nsType.kind;

    if (kind == NSType.KindAlias) {
        let returnType = symbolTyper.toTypecheckerType(nsType.returnType);

        lines.push(`declare type ${name} = ${returnType};`);

    } else if (kind == NSType.KindFunction) {
        let params = [ ];
        let returnType = symbolTyper.toTypecheckerType(nsType.returnType);

        for (let i = 0; i < nsType.parameterTypes.length; i++) {
            let optional = nsType.parameterOptional[i];
            let name     = nsType.parameterNames[i];

            params.push(name + (optional ? "?" : "") + ": " + symbolTyper.toTypecheckerType(nsType.parameterTypes[i]));
        }

        lines.push(`declare type ${name} = ( ${params.join(", ")} ) => ${returnType}`);

    } else if (kind == NSType.KindTuple) {
        let params = [ ];

        for (let i = 0; i < nsType.parameterTypes.length; i++) {
            params.push(symbolTyper.toTypecheckerType(nsType.parameterTypes[i]));
        }

        lines.push(`declare type ${name} = [ ${params.join(", ")} ]`);

    } else if (kind == NSType.KindObject) {
        let params = [ ];

        for (let i = 0; i < nsType.parameterTypes.length; i++) {
            let optional = nsType.parameterOptional[i];
            let name     = nsType.parameterNames[i];

            params.push(name + (optional ? "?" : "") + ": " + symbolTyper.toTypecheckerType(nsType.parameterTypes[i]));
        }

        lines.push(`interface ${name} { ${params.join(", ")} }`);
    }
}


_appendEnum(lines, nsEnum)
{
    // Anonymous enums are inlined
    if (!nsEnum.name || nsEnum.anonymous) return;

    lines.push("declare enum " + this._symbolTyper.getSymbolForEnumName(nsEnum.name) + " {");

    _.each(nsEnum.values, (value, name) => {
        lines.push(name + " = " + value + ",");
    });

    lines.push("}"); 
}


getFileDefinitions(nsFile)
{
    let model       = this._model;
    let symbolTyper = this._symbolTyper;

    let lines = [ ];

    _.each(nsFile.declares.classes, name => {
        let nsClass = model.classes[name];

        let classSymbol  = symbolTyper.getSymbolForClassName(nsClass.name, false);
        let staticSymbol = symbolTyper.getSymbolForClassName(nsClass.name, true);

        this._appendClass(lines, nsClass, classSymbol, staticSymbol);
    });

    _.each(nsFile.declares.protocols, name => {
        this._appendProtocol(lines, model.protocols[name]);
    });

    _.each(nsFile.declares.enums, name => {
        this._appendEnum(lines, model.enums[name]);
    });

    _.each(nsFile.declares.types, name => {
        this._appendType(lines, model.types[name]);
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
    _.each(model.globals, nsGlobal => {
        let name       = symbolTyper.getSymbolForIdentifierName(nsGlobal.name);
        let annotation = _.clone(nsGlobal.annotation);

        if (_.isArray(annotation)) {
            let line = name;
            let returnType = annotation.shift();

            line += "(" + _.map(annotation, (a, index) => {
                return "a" + index + ":" + symbolTyper.toTypecheckerType(a);
            }).join(",") + ")";

            line += " : " + symbolTyper.toTypecheckerType(returnType) + ";";

            lines.push(line);

        } else {
            lines.push(name + " : " + symbolTyper.toTypecheckerType(annotation) + ";");
        }
    });
    lines.push("}");

    this._appendClass( lines, model.getAggregateClass(), TypecheckerSymbols.Combined, TypecheckerSymbols.StaticCombined );
    classSymbols .unshift(TypecheckerSymbols.Combined);
    staticSymbols.unshift(TypecheckerSymbols.StaticCombined)

    let allSymbols = classSymbols.concat(staticSymbols);

    lines.push("declare type " + TypecheckerSymbols.IdIntersection + " = " + allSymbols.join("&") + ";");
    lines.push("declare type " + TypecheckerSymbols.IdUnion        + " = " + allSymbols.join("|") + ";");

    return lines.join("\n");
}


}
