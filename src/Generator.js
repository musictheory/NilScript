/*
    Generator.js
    Generates JavaScript or TypeScript from input code/AST/model
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { Modifier  } from "./Modifier.js";
import { NSError   } from "./Errors.js";
import { NSWarning } from "./Errors.js";
import { Syntax    } from "./ast/Tree.js";
import { Traverser } from "./ast/Traverser.js";
import { Utils     } from "./Utils.js";

import { NSModel   } from "./model/NSModel.js";

import  fs     from "node:fs";
let sCounter = 0;

const NSRootVariable  = "N$$_";
const NSSuperVariable = "N$_super";

const NSRootWithGlobalPrefix = NSRootVariable + "._g.";
const NSRootWithClassPrefix  = NSRootVariable + "._c.";

const LanguageEcmascript5 = "ecmascript5";
const LanguageTypechecker = "typechecker";
const LanguageNone        = "none";


export class Generator {


constructor(nsFile, model, options)
{
    this._file     = nsFile;
    this._model    = model;
    this._modifier = new Modifier(nsFile.contents);
    this._options  = options;

    let inlines = { };
    let symbolTyper = model.getSymbolTyper();

    let language = options["output-language"];
    if (language && language.match(/typechecker/)) {
        this._language = LanguageTypechecker;
    } else if (language && language.match(/none/)) {
        this._language = LanguageNone;
    } else {
        this._language = LanguageEcmascript5;
    }

    _.each(model.consts, nsConst => {
        let name = nsConst.name;

        if (inlines[name] === undefined) {
            inlines[name] = nsConst.raw;
        }
    });

    let additionalInlines = options["additional-inlines"];
    if (additionalInlines) {
        for (let key in additionalInlines) {
            if (additionalInlines.hasOwnProperty(key)) {
                inlines[key] = JSON.stringify(additionalInlines[key]);
            }
        }
    }

    this._inlines = inlines;
    this._squeeze = options["squeeze"] && (language != LanguageTypechecker);
}


generate()
{
    let traverser = new Traverser(this._file.ast);

    let model    = this._model;
    let modifier = this._modifier;
    let language = this._language;
    let options  = this._options;
    let inlines  = this._inlines;
    
    let toSkip = new Set();

    let currentNXClass;
    let currentClass;
    let currentFuncNode;

    let optionWarnGlobalNoType = options["warn-global-no-type"];

    let optionSqueeze = this._squeeze;
    let symbolTyper   = model.getSymbolTyper();

    let warnings = [ ];

    function checkRestrictedUsage(node)
    {
        let name = node.name;

        if (!node.ns_transformable) return;

        // if (currentMethodNode && currentClass) {
        //     if (currentClass.isIvar(name, true)) {
        //         Utils.throwError(NSError.RestrictedUsage, `Cannot use instance variable "${name}" here`, node);
        //     }
        // }

        if (inlines[name] || model.globals[name]) {
            Utils.throwError(NSError.RestrictedUsage, `Cannot use compiler-inlined "${name}" here`, node);
        }
    }

    function handleNSClassImplementation(node)
    {
        let name = node.id.name;
        let cls  = model.classes[name];

        let superName   = cls.superClass ? cls.superClass.name : null;
        let classSymbol = symbolTyper.getSymbolForClassName(name);
        
        if (cls.superClass) toSkip.add(cls.superClass);
        toSkip.add(node.id);

        // Only allow whitelisted children inside of an implementation block
        _.each(node.body.body, child => {
            let type = child.type;
            
            if (!(
                type == Syntax.NXPropDefinition ||
                type == Syntax.NXFuncDefinition ||
                (type == Syntax.MethodDefinition && child.kind == "get") ||
                (type == Syntax.MethodDefinition && child.kind == "set")
            )) {
                Utils.throwError(NSError.ParseError, 'Unexpected implementation child.', child);
            }

            if (type === Syntax.VariableDeclaration) {
                _.each(child.declarations, declaration => {
                    if (declaration.init) {
                        if (declaration.init.type !== Syntax.Literal &&
                            declaration.init.type !== Syntax.FunctionExpression)
                        {
                            Utils.throwError(NSError.ParseError, 'Variable declaration must be initialized to a constant.', declaration.init);
                        }
                    }
                });
            }
        });

        let startText;
        let endText;

        if (language === LanguageEcmascript5) {
            let extendsString = NSRootWithClassPrefix +
                (superName ? symbolTyper.getSymbolForClassName(superName) : "N$_base");

            startText = `${NSRootWithClassPrefix}${classSymbol} = class ${classSymbol} extends ${extendsString} {`;

            let hasInit = false;
            for (let method of cls._methods) {
                if (method.baseName == "init") {
                    hasInit = true;
                }            
            }
            
            if (hasInit) {
                startText += `constructor(...A) { ${NSRootVariable}._i(super(${NSRootVariable}._i0), ...A); }`;
            }

            endText = "};";

        } else if (language === LanguageTypechecker) {
            startText = "(function() { ";
            endText = "});";
        }

        if (!node.body.body.length) {
            modifier.replace(node, startText + endText);

        } else {
            modifier.replace(node.start, node.body.start, startText);
            modifier.replace(node.body.end, node.end, endText);
        }
    }

    function handleMethodDefinition(node)
    {
        if (language === LanguageTypechecker) {
            let classSymbol = symbolTyper.getSymbolForClassName(currentClass.name, node.static);
            
            let replacement = "";

            if (node.kind == "set") {
                let replacement = `(function(this: ${classSymbol}, `

                toSkip.add(node.key);
                
                modifier.replace(node.start, node.value.params[0].start, replacement);
                modifier.replace(node.value.end, node.end, ");");
                
            } else if (node.kind == "get") {
                let replacement = `(function(this: ${classSymbol})`

                toSkip.add(node.key);

                modifier.replace(node.start, node.value.annotation.start, replacement);
                modifier.replace(node.value.end, node.end, ");");
            }
        }    
    }

    function handleSuper(node)
    {
        if (language === LanguageTypechecker) {
            modifier.replace(node, "this." + NSSuperVariable + "()");
        }
    } 
   
    function handleCallExpression(node)
    {
        let baseNode = node.nx_baseNode;
        
        if (baseNode) {
            modifier.replace(node.nx_baseNode, node.nx_funcName);

            toSkip.add(baseNode);
            
            for (let argument of node.arguments) {
                if (argument.type === Syntax.NXNamedArgument) {
                    modifier.remove(argument.name);
                    modifier.remove(argument.colon);

                    toSkip.add(argument.name);
                }
            }
        }
    }

    function handleNewExpression(node)
    {
        let components = [ ];
        let hasNamedArgument = false;

        for (let argument of node.arguments) {
            if (argument.type === Syntax.NXNamedArgument) {
                hasNamedArgument = true;
                components.push("_" + argument.name.name.replaceAll("_", "$"));

                modifier.remove(argument.name);
                modifier.remove(argument.colon);

                toSkip.add(argument.name);

            } else {
                components.push("_");
            }
        }

        if (hasNamedArgument) {
            let baseNode = node.callee;
            
            let funcName = "init" + components.join("");
        
            if (language === LanguageTypechecker) {
                let replacement = `()).${funcName}(`;
            
                modifier.replace(node.start, node.callee.start, "((new ");
                modifier.replace(node.callee.end, node.arguments[0].start, replacement);

                modifier.replace(node.arguments[node.arguments.length - 1].end, node.end, "))");

            } else {
                let replacement = `(${NSRootVariable}._in, "${funcName}", `;
                
                modifier.replace(node.callee.end, node.arguments[0].start, replacement);
            }
        }
    }

    function handleNSPredefinedMacro(node)
    {
        let name = node.name;

        let className = currentClass ? currentClass.name : null;
        
        if (optionSqueeze) {
            className = className && symbolTyper.getSymbolForClassName(className);
        }

        if (name === "@CLASS") {
            if (currentClass) {
                modifier.replace(node, '"' + className + '"');
            } else {
                Utils.throwError(NSError.ParseError, 'Cannot use @CLASS outside of a class implementation');
            }

        } else if (name === "@FUNCTION_ARGS") {
            let replacement = null;

            if (className && currentFuncNode) {
                let isStatic = currentFuncNode.static;
                
                //!FIXME: Implement
                replacement = "\"\"";
            }

            if (replacement) {
                modifier.replace(node, replacement);
            } else {
                Utils.throwError(NSError.ParseError, `Cannot use @FUNCTION_ARGS outside of a method definition`);
            }

        } else {
            Utils.throwError(NSError.ParseError, `Unknown identifier: "${name}"`);
        }
    }

    function handleNSTypeDefinition(node)
    {
        if (language === LanguageTypechecker) {
            let typesToCheck = [ ];

            _.each(node.params, param => {
                typesToCheck.push( symbolTyper.toTypecheckerType(param.annotation.value) );
            });

            if (node.annotation) {
                typesToCheck.push( symbolTyper.toTypecheckerType(node.annotation.value) );
            }

            // Lay down a cast operation with all needed types.  This will generate a warning due to an unknown type.  
            modifier.replace(node, "<[ " + typesToCheck.join(", ") + "]> null;");

        } else {
            modifier.remove(node);
        }
    }


    function handleIdentifier(node, parent)
    {
        let name = node.name;

        if (name == "self") {
            warnings.push(Utils.makeError(NSWarning.UseOfSelfInNonMethod, `Use of "self"`, node));
        }

        if (name[0] === "N" && name[1] === "$") {
            Utils.throwError(NSError.ReservedIdentifier, `Identifiers may not start with "N$"`, node);

        } else if (name[0] === "@") {
            handleNSPredefinedMacro(node);
            return;
        }

        if (!node.ns_transformable) return;

        let nsGlobal = model.globals[name];
        let replacement;

        if (nsGlobal) {
            replacement = NSRootWithGlobalPrefix + (optionSqueeze ? symbolTyper.getSymbolForIdentifierName(name) : name);

            modifier.replace(node, replacement);

            return;
        }
        
        if (model.classes[name]) {
            let classVariable = symbolTyper.getSymbolForClassName(name);

            if (language === LanguageEcmascript5) {
                classVariable = NSRootWithClassPrefix + classVariable;
            }

            modifier.replace(node, classVariable);
            return;
        }

        if (inlines) {
            let result = inlines[name];
            if (result !== undefined) {
                if (inlines.hasOwnProperty(name)) {
                    modifier.replace(node, "" + result);
                    return;
                }
            }
        }

        if (optionSqueeze) {
            let result = symbolTyper.getSymbolForIdentifierName(name);
            if (result !== undefined) {
                modifier.replace(node, "" + result);
                return;
            }
        }
    }

    function handleMemberExpression(node, parent)
    {
        if (node.computed ||
            node.object.type !== Syntax.Identifier ||
            !model.enums[node.object.name]
        ) {
            return;
        }
        
        if (node.property.type !== Syntax.Identifier) {
            warnings.push(Utils.makeError(NSWarning.UnknownEnumMember, `enum member must be an identifier`, node));
            return;
        }

        let nsEnum = model.enums[node.object.name];
        let memberName = node.property.name;
        let member = nsEnum.members.get(memberName);

        if (member) {
            toSkip.add(node.object);
            toSkip.add(node.property);

            let replacement;
            if (language == LanguageTypechecker) {
                let enumNameSymbol = symbolTyper.getSymbolForEnumName(nsEnum.name);
                replacement = enumNameSymbol + "." + member.name;
            } else {
                replacement = "" + member.value;
            }
            
            modifier.replace(node, replacement);

        } else {
            warnings.push(
                Utils.makeError(NSWarning.UnknownEnumMember, `Unknown enum member '${memberName}`, node.property)
            );
        }
    }

    function handleVariableDeclaration(node, parent)
    {
        for (let declaration of node.declarations) {
            checkRestrictedUsage(declaration.id);
        }
    }

    function handleNSEnumDeclaration(node)
    {
        let length = node.declarations ? node.declarations.length : 0;
        let last   = node;

        if (length) {
            let firstDeclaration = node.declarations[0];
            let lastDeclaration  = node.declarations[length - 1];

            for (let i = 0; i < length; i++) {
                let declaration = node.declarations[i];

                if (!declaration.init) {
                    modifier.insert(declaration.id.end, "=" + declaration.enumValue);
                }

                if (last == node) {
                    modifier.insert(declaration.id.start, "var ");
                    modifier.remove(last.end, declaration.id.start);

                } else {
                    modifier.insert(last.end, "; ");
                    modifier.replace(last.end, declaration.id.start, "var ");
                }

                last = declaration;
            }

            modifier.insert(lastDeclaration.end, ";");
            modifier.remove(lastDeclaration.end, node.end);

        } else {
            modifier.remove(node);
        }
    }

    function handleNSConstDeclaration(node)
    {
        let length = node.declarations ? node.declarations.length : 0;
        let values = [ ];

        if (length) {
            let firstDeclaration = node.declarations[0];

            modifier.replace(node.start, firstDeclaration.id.start, "var ");

        } else {
            modifier.remove(node);
        }
    }

    function handleNSCastExpression(node)
    {
        let before = "(";
        let after  = ")";

        if (language == LanguageTypechecker) {
            before = "(<" + symbolTyper.toTypecheckerType(node.id) + ">(<any>(";
            after  = ")))";
        }

        modifier.replace(node.start, node.argument.start, before);
        modifier.replace(node.argument.end, node.end, after);
    }

    function handleNSAnyExpression(node)
    {
        let before = (language == LanguageTypechecker) ? "(<any>(" : "(";
        let after  = (language == LanguageTypechecker) ? "))"      : ")";

        modifier.replace(node.start, node.argument.start, before);
        modifier.replace(node.argument.end, node.end, after);
    }

    function handleNSTypeAnnotation(node, parent)
    {
        if (language === LanguageTypechecker) {
            let inValue  = node.value;
            let outValue = symbolTyper.toTypecheckerType(inValue);

            if (inValue != outValue) {
                modifier.replace(node.start, node.end, ": " + outValue);
            }

        } else {
            modifier.remove(node);
        }
    }

    function handleNSGlobalDeclaration(node)
    {
        let declaration  = node.declaration;
        let declarations = node.declarations;

        if (optionWarnGlobalNoType) {
            let allTyped;

            if (declaration) {
                allTyped = !!declaration.annotation && _.every(declaration.params, param => !!param.annotation);

            } else if (declarations) {
                allTyped = _.every(declarations, declaration => !!declaration.id.annotation);
            }

            if (!allTyped) {
                warnings.push(Utils.makeError(NSWarning.MissingTypeAnnotation, "Missing type annotation on @global", node));
            }
        }

        if (language !== LanguageTypechecker) {
            if (declaration) {
                let name = symbolTyper.getSymbolForIdentifierName(declaration.id.name);

                modifier.replace(node.start, declaration.start, NSRootWithGlobalPrefix + name + "=");
                modifier.remove(declaration.id);

                toSkip.add(declaration.id);

            } else if (declarations) {
                modifier.remove(node.start, declarations[0].start);

                _.each(declarations, declaration => {
                    let name = symbolTyper.getSymbolForIdentifierName(declaration.id.name);

                    modifier.replace(declaration.id, NSRootWithGlobalPrefix + name);

                    toSkip.add(declaration.id);
                })
            }

        } else {
            if (declaration) {
                modifier.replace(node.start, declaration.id.start, "(function ");
                modifier.remove(declaration.id);
                modifier.insert(node.end, ");");

                toSkip.add(declaration.id);

            } else if (declarations) {
                modifier.replace(node.start, declarations[0].start, "(function() { var ");
                modifier.insert(node.end, "});");

                let index = 0;
                _.each(declarations, declaration => {
                    let replacement = "a" + index++;
                    modifier.replace(declaration.id, replacement);
                    toSkip.add(declaration.id);
                });
            }
        }
    }

    function handleFunctionDeclarationOrExpression(node)
    {
        _.each(node.params, param => {
            checkRestrictedUsage(param);
        });
    }

    function handleProperty(node) 
    {
        let key = node.key;

        if (node.computed && (key.type === Syntax.Identifier)) {
            let nsConst = model.consts[key.name];

            if (nsConst && _.isString(nsConst.value)) {
                modifier.replace(node.start, node.value.start, nsConst.raw + ":");
                modifier.remove(node.value.end, node.end);
                
                toSkip.add(key);
            }
        }
    }
    
    function handleNXPropDefinition(node)
    {
        let name = node.key.name;

        toSkip.add(node.key);
        toSkip.add(node.annotation);
        
        let property = currentClass.getPropertyWithName(name);
        let isStatic = property.isStatic;
        let propertySymbol = symbolTyper.getSymbolForIdentifierName(name);
        let backingSymbol  = symbolTyper.getSymbolForIdentifierName(`_${name}`);
        
        let result = "";
        
        let staticString = isStatic ? "static" : "";

        if (language === LanguageEcmascript5) {
            if (property.wantsSetter && !currentClass.getSetter(name, isStatic)) {
                let isObserved = property.attributes.indexOf("observed") >= 0;

                let s = [ ];

                if (isObserved) {
                    s.push(`if (this.${backingSymbol} !== arg) {`);
                }

                s.push(`this.${backingSymbol} = arg;`);

                if (isObserved) {
                    let changeSymbol = symbolTyper.getSymbolForIdentifierName("observePropertyChange");
                    s.push(`this.${changeSymbol}();`);
                    s.push(`}`);
                }

                result += `${staticString} set ${propertySymbol}(arg) {${s.join(" ")} } `;
            }
                
            if (property.wantsSetter) {
                let legacySetterName = property.legacySetterName;
                let legacySetterSymbol = symbolTyper.getSymbolForIdentifierName(legacySetterName);

                result += `${staticString} ${legacySetterSymbol}(arg) {this.${propertySymbol}=arg;} `; 
            }

            if (property.wantsGetter && !currentClass.getGetter(name, isStatic)) {
                result += `${staticString} get ${propertySymbol}() { return this.${backingSymbol}; } `;
            }

            let initValue;
            if (model.isNumericType(property.type)) {
                initValue = "0";
            } else if (model.isBooleanType(property.type)) {
                initValue = "false";
            } else {
                initValue = "null";
            }

            result += `${staticString} ${backingSymbol} = ${initValue}`;

        } else if (language === LanguageTypechecker) {
            result += "<" + symbolTyper.toTypecheckerType(property.type) + "> null;";
        }
        
        if (!result) {
            modifier.remove(node);
        } else {
            modifier.replace(node, result);
        }
    }

    function handleNXFuncDefinition(node)
    {
        let isStatic = node.static;

        let replacement = node.key.name;

        let components = [ ];
        let hasNamedArgument = false;

        for (let param of node.params) {
            let label = param.label?.name;
            if (!label) label = param.name.name;
            if (!label) label = "";

            if (param.label?.name == "_") {
                components.push("_");
            } else {
                components.push("_" + label.replaceAll("_", "$"));
                hasNamedArgument = true;
            }
        }
        
        if (hasNamedArgument) {
            replacement += components.join("");
        }
        
        if (language === LanguageTypechecker) {
            let args = [ ];

            args.push("this" + " : " + symbolTyper.getSymbolForClassName(currentClass.name, isStatic) );

            for (let param of node.params) {
                let name = param.name.name;
                let outputType = symbolTyper.toTypecheckerType(param.annotation?.value);
                args.push(name + " : " + outputType);
                
                toSkip.add(param);
            }
            
            toSkip.add(node.annotation);
       
            let definition = "(function(" + args.join(", ") + ") ";

            let returnType = node.annotation?.value;
            if (returnType == "instancetype" || returnType == "init") returnType = currentClass.name;
            if (returnType) {
                definition += ": " + symbolTyper.toTypecheckerType(returnType);
            }

            modifier.replace(node.start, node.body.start, definition);
            modifier.replace(node.body.end, node.end, ");");

        } else {
            modifier.replace(node.start, node.key.start, isStatic ? "static " : "");
            modifier.replace(node.key, replacement);
        }
    }

    function handleNXFuncParameter(node)
    {
        if (node.label) {
            modifier.remove(node.label);
            toSkip.add(node.label);
        }
    }

let path = this._file.path;

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (toSkip.has(node)) return Traverser.SkipNode;

        if (type === Syntax.NSProtocolDefinition ||
            type === Syntax.NSEnumDeclaration    ||
            type === Syntax.NSConstDeclaration
        ) {
            modifier.remove(node);
            return Traverser.SkipNode;

        } else if (type === Syntax.NSBridgedDeclaration) {
            modifier.remove(node.start, node.declaration.start);

        } else if (type === Syntax.NSClassImplementation) {
            currentClass = model.classes[node.id.name];
            handleNSClassImplementation(node);

        } else if (type === Syntax.CallExpression) {
            handleCallExpression(node);

        } else if (type === Syntax.NewExpression) {
            handleNewExpression(node);

        } else if (type === Syntax.NSEnumDeclaration) {
            handleNSEnumDeclaration(node);

        } else if (type === Syntax.NSConstDeclaration) {
            handleNSConstDeclaration(node);

        } else if (type === Syntax.NSCastExpression) {
            handleNSCastExpression(node);

        } else if (type === Syntax.NSAnyExpression) {
            handleNSAnyExpression(node);

        } else if (type === Syntax.NSTypeAnnotation || type === "TSTypeAnnotation") {
            handleNSTypeAnnotation(node, parent);

        } else if (type === Syntax.NSGlobalDeclaration) {
            handleNSGlobalDeclaration(node);

        } else if (type === Syntax.NSPredefinedMacro) {
            handleNSPredefinedMacro(node);

        } else if (type === Syntax.NSTypeDefinition) {
            handleNSTypeDefinition(node);

        } else if (type === Syntax.Identifier) {
            handleIdentifier(node, parent);

        } else if (type === Syntax.MemberExpression) {
            handleMemberExpression(node, parent);

        } else if (type === Syntax.VariableDeclaration) {
            handleVariableDeclaration(node);

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression || type === Syntax.ArrowFunctionExpression) {
            handleFunctionDeclarationOrExpression(node);

        } else if (type === Syntax.MethodDefinition) {
            handleMethodDefinition(node);

        } else if (type === Syntax.Super) {
            handleSuper(node);

        } else if (type === Syntax.Property) {
            handleProperty(node);

        } else if (type === Syntax.NXClassDeclaration) {
            currentNXClass = node.nxClass;

        } else if (type === Syntax.NXPropDefinition) {
            handleNXPropDefinition(node);

        } else if (type === Syntax.NXFuncDefinition) {
            currentFuncNode = node;
            handleNXFuncDefinition(node);

        } else if (type === Syntax.NXFuncParameter) {
            handleNXFuncParameter(node);
        }

        
    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.NSClassImplementation) {
            currentClass = null;

        } else if (type === Syntax.NXFuncDefinition) {
            currentFuncNode = null;        
        }
    });

    _.each(warnings, warning => {
        Utils.addFilePathToError(path, warning);
    });

    let lines = modifier.finish().split("\n");
        
    if (lines.length) {
        lines[0] = "(function(){\"use strict\";" + lines[0];
        lines[lines.length - 1] += "})();";    
    }

    return { lines, warnings };
}

}
