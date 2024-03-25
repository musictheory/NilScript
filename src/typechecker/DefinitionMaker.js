/*
    DefinitionMaker.js
    Responsible for generating TypeScript definition files for NilScript model objects
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { NSType        } from "../model/NSType.js";
import { NSSymbolTyper } from "../model/NSSymbolTyper.js";

const TypecheckerSymbols = NSSymbolTyper.TypecheckerSymbols;


export class DefinitionMaker {


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

    symbols.unshift(isStatic ? "typeof N$_BaseProtocol" : "N$_BaseProtocol");

    if (symbols.length) {
        return " " + verb + " " + symbols.join(",");
    }

    return "";
}


_getDeclarationForMethod(method)
{
    let symbolTyper = this._symbolTyper;

    let line = method.isStatic ? "static " : "";
    line += method.baseName;
   
    // name
    let components = [ ];
    let hasNamedArgument = false;

    for (let parameter of method.parameters) {
        let label = parameter.label;
        if (!label) label = parameter.name;
        if (!label) label = "";

        if (label == "_") {
            components.push("_");
        } else {
            components.push("_" + label.replaceAll("_", "$"));
            hasNamedArgument = true;
        }
    }

    if (hasNamedArgument) {
        line += components.join("");
    }

    if (method.isOptional) {
        line += "?";
    } 
   
    line += "("
    line += method.parameters.map(parameter => {
        let p = parameter.name;
        
        if (parameter.type) {
            p += ": " + symbolTyper.toTypecheckerType(parameter.type);
        }

        return p;
    }).join(", ");
    line += ")";
    
    let returnType = method.returnType;
    if (method.baseName == "init") {
        returnType = "this";
    } else {
        returnType = symbolTyper.toTypecheckerType(returnType);
    }
    
    if (returnType) {
        line += `: ${returnType}`;
    }

    return line;
}


_appendClass(lines, nsClass, classSymbol, staticSymbol)
{
    let symbolTyper = this._symbolTyper;

    let superClassName = nsClass.superClass ? nsClass.superClass.name : null;

    let superSymbol       = superClassName ? symbolTyper.getSymbolForClassName(superClassName, false) : TypecheckerSymbols.Base;
    let superStaticSymbol = superClassName ? symbolTyper.getSymbolForClassName(superClassName, true)  : ("typeof " + TypecheckerSymbols.Base);

    let declaredMethodNames = { };
    let methods = [ ];

    lines.push(
        "declare class " + classSymbol +
            " extends " + superSymbol +
            this._getProtocolList("implements", false, nsClass.protocolNames) +
            " {"
    );

    _.each(nsClass.getAllProperties(), property => {
        let propertySymbol = symbolTyper.getSymbolForIdentifierName(property.name);
        let backingSymbol  = symbolTyper.getSymbolForIdentifierName(`_${property.name}`);
        let type           = symbolTyper.toTypecheckerType(property.type);
        
        let prefix = property.isStatic ? "static" : "";
        
        if (property.wantsGetter) {
            lines.push(`${prefix} get ${propertySymbol}(): ${type}`);
        }
        
        if (property.wantsSetter) {
            let legacySetterName = property.legacySetterName;
            let legacySetterSymbol = symbolTyper.getSymbolForIdentifierName(legacySetterName);

            lines.push(`${prefix} set ${propertySymbol}(arg: ${type})`);
            lines.push(`${prefix} ${legacySetterSymbol}(arg: ${type})`);
        }

        lines.push(`${prefix} ${backingSymbol}: ${type}`);
    });

    for (let method of nsClass._methods) {
        lines.push(this._getDeclarationForMethod(method));
    }

    for (let { name, isStatic, type } of nsClass._getters.values()) {
        type = symbolTyper.toTypecheckerType(type);

        let staticString = isStatic ? "static" : "";
        name = symbolTyper.getSymbolForIdentifierName(name);
        type = symbolTyper.toTypecheckerType(type);
        lines.push(`${staticString} get ${name}(): ${type}`);
    }

    for (let { name, isStatic, type } of nsClass._setters.values()) {
        type = symbolTyper.toTypecheckerType(type);
    
        let staticString = isStatic ? "static" : "";
        name = symbolTyper.getSymbolForIdentifierName(name);
        type = symbolTyper.toTypecheckerType(type);
        lines.push(`${staticString} set ${name}(arg: ${type})`);
    }

    lines.push(
        "N$_super() : " + superSymbol + ";",
        "static N$_super() : " + superStaticSymbol + ";",
        "}"
    );
}


_appendProtocol(lines, nsProtocol)
{
    let symbolTyper = this._symbolTyper;

    let protocolSymbol = symbolTyper.getSymbolForProtocolName(nsProtocol.name, false);
    let staticSymbol   = symbolTyper.getSymbolForProtocolName(nsProtocol.name, true);

    lines.push("declare interface " + protocolSymbol + this._getProtocolList("extends", false, nsProtocol.protocolNames) + " {");

    for (let method of nsProtocol.getMethods()) {
        lines.push(this._getDeclarationForMethod(method));
    }

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
    lines.push("declare enum " + this._symbolTyper.getSymbolForEnumName(nsEnum.name) + " {");

    for (let member of nsEnum.members.values()) {
        lines.push(member.name + " = " + member.value + ",");
    }

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

    return lines.join("\n");
}


}
