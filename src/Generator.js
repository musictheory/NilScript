/*
    Generator.js
    Generates JavaScript or TypeScript from input code/AST/model
    (c) 2013-2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import { Modifier     } from "./Modifier.js";
import { Syntax       } from "./ast/Tree.js";
import { Traverser    } from "./ast/Traverser.js";
import { TypePrinter  } from "./ast/TypePrinter.js";
import { ScopeManager } from "./ScopeManager.js";
import { SymbolUtils  } from "./SymbolUtils.js";

import { Model         } from "./model/Model.js";
import { CompilerIssue } from "./model/CompilerIssue.js";

import path from "node:path";

const LanguageEcmascript  = "ecmascript";
const LanguageTypechecker = "typechecker";
const LanguageNone        = "none";


export class Generator {


constructor(nsFile, model, squeezer, options)
{
    this._file     = nsFile;
    this._model    = model;
    this._modifier = new Modifier(nsFile.contents);
    this._squeezer = squeezer;
    this._options  = options;

    let inlines = new Map();

    let language = options["output-language"];
    if (language && language.match(/typechecker/)) {
        this._language = LanguageTypechecker;
    } else if (language && language.match(/none/)) {
        this._language = LanguageNone;
    } else {
        this._language = LanguageEcmascript;
    }

    for (let { name, raw } of model.globalConsts.values()) {
        if (!inlines.has(name)) {
            inlines.set(name, raw);
        }
    }

    let additionalInlines = options["additional-inlines"];
    if (additionalInlines) {
        for (let key in additionalInlines) {
            if (additionalInlines.hasOwnProperty(key)) {
                inlines.set(key, JSON.stringify(additionalInlines[key]));
            }
        }
    }

    this._inlines = inlines;
}


generate()
{
    let traverser = new Traverser(this._file.ast);
    let scopeManager = this._file.scopeManager;

    let model    = this._model;
    let modifier = this._modifier;
    let squeezer = this._squeezer;
    let language = this._language;
    let options  = this._options;
    let inlines  = this._inlines;
    let filePath = this._file.path;
    
    let toSkip = new Set();

    let currentClass = null;
    let classStack = [ ];

    let warnings = [ ];

    function checkRestrictedUsage(node)
    {
        let name = node.name;

        if (!node.ns_transformable) return;

        if (inlines.has(name) || model.globalFunctions.has(name)) {
            throw new CompilerIssue(`Cannot use compiler-inlined "${name}" here`, node);
        }
    }

    function shouldRemove(node)
    {
        let type = node.type;
        
        if (language != LanguageTypechecker && (
            type == Syntax.TSTypeAnnotation       ||
            type == Syntax.NXEnumDeclaration      ||
            type == Syntax.NXInterfaceDeclaration ||
            type == Syntax.NXTypeDeclaration
        )) {
            return true;
        }
    
        return false;
    }
    
    function handleRuntimeMemberExpression(node, parent)
    {
        let propertyName = node.property.name;

        let replaceParent = false; 
        let replacement   = null;
      
        // Nyx.getFuncIdentifier()
        if (propertyName == "getFuncIdentifier") {
            if (
                parent.type != Syntax.CallExpression ||
                parent.arguments.length != 1 ||
                parent.arguments[0].type != Syntax.Literal
            ) {
                throw new CompilerIssue(`Invalid use of Nyx.getFuncIdentifier`, node);
            }
            
            let funcString = parent.arguments[0].value;
            let funcComponents = SymbolUtils.fromFuncString(funcString);

            if (!funcComponents) {
                throw new CompilerIssue(`"${funcString}" is not a valid func signature.`, node);
            }

            let funcIdentifier = SymbolUtils.toFuncIdentifier(funcComponents);
            if (!funcIdentifier) {
                throw new CompilerIssue(`"${funcString}" has no named arguments.`, node);
            }

            if (squeezer) {
                funcIdentifier = squeezer.squeeze(funcIdentifier);
            }

            replaceParent = true;
            replacement = `"${funcIdentifier}"`;
        
        // Nyx.handleInit()        
        } else if (propertyName == "handleInit") {
            replacement = SymbolUtils.RootVariable + ".i";

        // Nyx.noInitSymbol
        } else if (propertyName == "noInitSymbol") {
            replacement = SymbolUtils.RootVariable + ".m";

        } else if (propertyName == "namedInitSymbol") {
            replacement = SymbolUtils.RootVariable + ".n";

        } else {
            throw new CompilerIssue(`Unknown runtime property: Nyx.${propertyName}`, node);
        }

        toSkip.add(node.object);
        toSkip.add(node.property);

        if (replaceParent && (parent.type == Syntax.CallExpression)) {
            parent.arguments.forEach(a => toSkip.add(a));
            modifier.replace(parent, replacement);
        } else {
            modifier.replace(node, replacement);
        }
    }
    
    function handleExportDeclaration(node)
    {
        if (shouldRemove(node.declaration)) {
            modifier.remove(node.start, node.declaration.start);

        } else if (language == LanguageEcmascript) {
            let exportedNames = [ ];

            if (node.declaration.type == Syntax.VariableDeclaration) {
                for (let declaration of node.declaration.declarations) {
                    exportedNames.push(declaration.id.name);
                }

            } else if (node.declaration.id) {
                exportedNames.push(node.declaration.id.name);
            }

            let replacement = exportedNames.map(name => {
                let lhs = SymbolUtils.getImportExpression(name, squeezer);
                return `${lhs} = ${name};`;
            });
            
            if (replacement) {
                modifier.replace(node.start, node.declaration.start, "");
                modifier.replace(node.declaration.end, node.end, replacement);
            }
        }
    }
    
    function handleClassDeclaration(node)
    {
        let name = node.id.name;
        
        function isInitBased(cls) {
            if (cls.hasConstructor) return false;
            if (cls.hasFuncOrProp)  return true;
            
            return false;
        }

        classStack.push(currentClass);
        currentClass = scopeManager.getValue(name)?.object;

        toSkip.add(node.id);

        if (isInitBased(currentClass) && language === LanguageEcmascript) {
            let rootVariable = SymbolUtils.RootVariable;

            let constructorText = node.superClass ?
                `constructor(...A) { ${rootVariable}.i(super(${rootVariable}.m), ...A); }` :
                `constructor(...A) { ${rootVariable}.i(this, ...A); }`;
                    
            if (node.body.body.length > 0) {
                modifier.replace(node.body.start, node.body.body[0].start, `{${constructorText}`);

            } else {
                modifier.replace(node.body, `{${constructorText}}`);
            }
        }
    }

    function handlePropertyDefinition(node)
    {
        if (language !== LanguageTypechecker) {
            if (node.readonly) {
                let replacement = node.static ? "static" : "";
                modifier.replace(node.start, node.key.start, replacement);                
            }            
        }
    }

    function handleMethodDefinition(node)
    {
        if (language === LanguageTypechecker) {
            if (node.kind == "set" && node.value.annotation) {
                modifier.remove(node.value.annotation);
                toSkip.add(node.value.annotation);
            }
        }
    }

    function handleImportDeclaration(node)
    {
        let specifiers = node.specifiers;
        let length = specifiers.length;

        let replacements = [ ];
        
        for (let i = 0; i < length; i++) {
            let specifier = specifiers[i];

            let name = specifier.imported.name;
            let declaration = scopeManager.getImport(name);
                
            if (!declaration) {
                warnings.push(new CompilerIssue(`Unknown import: "${name}"`, specifier));
                continue;
            }
            
            if (declaration.object instanceof Model.Runtime) {
                continue                
            }

            if (language == LanguageTypechecker) {
                let toPath = declaration.object?.location?.path;

                if (!toPath) {
                    warnings.push(new CompilerIssue(`No known path for: "${name}"`, specifier));
                    continue;
                }
                
                let importPath = path.relative(path.dirname(filePath), toPath);
                replacements.push(`import { ${name} } from "${importPath}";`);
            
            } else if (declaration.importType == ScopeManager.ImportType.Past) {
                let expression = SymbolUtils.getImportExpression(name, squeezer);
                replacements.push(`${name} = ${expression}`);
            }
        }

        let replacement = "";
        
        if (replacements.length) {
            replacement = (language == LanguageTypechecker) ?
            replacements.join("") :
            `const ${replacements.join(",")};`
        }

        modifier.replace(node, replacement);
    }
   
    function handleCallExpression(node)
    {
        let funcName = node.nx_func;
        let baseNode = node.nx_base;

        if (funcName) {
            if (squeezer) {
                funcName = squeezer.squeeze(funcName);
            }

            modifier.replace(baseNode, funcName);

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
        for (let argument of node.arguments) {
            if (argument.type === Syntax.NXNamedArgument) {
                modifier.remove(argument.name);
                modifier.remove(argument.colon);

                toSkip.add(argument.name);
            }
        }

        let funcName = node.nx_func;

        if (funcName) {
            if (squeezer) {
                funcName = squeezer.squeeze(funcName);
            }

            if (language === LanguageTypechecker) {
                let replacement = `()).${funcName}(`;
            
                modifier.replace(node.start, node.callee.start, "((new ");
                modifier.replace(node.callee.end, node.arguments[0].start, replacement);

                modifier.replace(node.arguments[node.arguments.length - 1].end, node.end, "))");

            } else {
                let replacement = `(${SymbolUtils.RootVariable}.n, "${funcName}", `;
                
                modifier.replace(node.callee.end, node.arguments[0].start, replacement);
            }
        }
    }

    function handleIdentifier(node, parent)
    {
        let name = node.name;

        if (name[0] === "N" && name[1] === "$") {
            throw new CompilerIssue(`Identifiers may not start with "N$"`, node);
        }

        let replacement;

        let isParentProperty = (
            parent.type == Syntax.Property ||
            parent.type == Syntax.MethodDefinition ||
            parent.type == Syntax.PropertyDefinition ||
            parent.type == Syntax.MemberExpression ||
            parent.type == Syntax.TSObjectMember
        );

        // Special case: handle shorthand syntax
        if (parent.type == Syntax.Property && parent.shorthand) {
            if (node == parent.key && squeezer) {
                let squeezedName = squeezer.squeeze(name);
                replacement = `${squeezedName}: ${name}`;
            }
        }

        // Squeeze if needed
        if (
            !replacement && 
            isParentProperty &&
            !parent.computed &&
            (node == parent.key || node == parent.property)
        ) {
            if (squeezer) replacement = squeezer.squeeze(name);
        }

        // Globals
        if (!replacement && model.globalFunctions.has(name)) {
            replacement = SymbolUtils.getGlobalExpression(name, squeezer);
        }
        
        // Imports
        if (!replacement) {
            let scopeDeclaration = scopeManager.getValue(name);

            if (
                language === LanguageEcmascript &&
                scopeDeclaration?.importType == ScopeManager.ImportType.Future
            ) {
                replacement = SymbolUtils.getImportExpression(name, squeezer);
            }
        }

        // Ivars?
        if (!replacement && (name[0] == "_") && currentClass?.hasIvar(name)) {
            replacement = `this.#${name.slice(1)}`;
        }

        // Inlines
        if (!replacement && inlines.has(name)) {
            replacement = inlines.get(name);
        }
        
        if (replacement) {
            modifier.replace(node, replacement);

            if (node.annotation) toSkip.add(node.annotation);
            if (node.question)   toSkip.add(node.question);
        } else {
            if (node.question && language != LanguageTypechecker) {
                modifier.remove(node.question)
                toSkip.add(node.question);
            }
        }
    }

    function handleMemberExpression(node, parent)
    {
        if (node.computed || node.object.type !== Syntax.Identifier) {
            return;
        }

        let object = scopeManager.getValue(node.object.name)?.object;

        if (object instanceof Model.Enum) {
            if (node.property.type !== Syntax.Identifier) {
                warnings.push(new CompilerIssue(`enum member must be an identifier`, node));
                return;
            }

            let nsEnum = object;
            let memberName = node.property.name;
            let member = nsEnum.members.get(memberName);

            if (member) {
                toSkip.add(node.object);
                toSkip.add(node.property);

                let replacement;
                if (language == LanguageTypechecker) {
                    replacement = nsEnum.name + "." + member.name;
                } else {
                    if (typeof member.value == "string") {
                        replacement = `"${member.value}"`;
                    } else {
                        replacement = "" + member.value;
                    }
                
                    modifier.replace(node, replacement);
                }

            } else {
                warnings.push(new CompilerIssue(`Unknown enum member '${memberName}`, node.property));
            }

        } else if (object instanceof Model.Runtime) {
            handleRuntimeMemberExpression(node, parent);
        }
    }

    function handleVariableDeclaration(node, parent)
    {
        for (let declaration of node.declarations) {
            checkRestrictedUsage(declaration.id);
        }
    }

    function handleNXAsExpression(node)
    {
        if (language !== LanguageTypechecker) {
            modifier.remove(node.expression.end, node.annotation.start);
        }
    }

    function handleNXNonNullExpression(node)
    {
        if (language !== LanguageTypechecker) {
            modifier.remove(node.expression.end, node.end);
        }
    }

    function handleTSTypeAnnotation(node, parent)
    {
        if (language === LanguageTypechecker) {
            modifier.replace(node, TypePrinter.print(node, true));
        } else {
            modifier.remove(node);
        }

        toSkip.add(node.value);
    }

    function handleNXGlobalDeclaration(node)
    {
        let declaration = node.declaration;

        if (declaration.type == Syntax.FunctionDeclaration) {

            let replacement = SymbolUtils.getGlobalExpression(declaration.id.name, squeezer) + "=";

            modifier.replace(node.start, declaration.start, replacement);
            modifier.remove(declaration.id);

            toSkip.add(declaration.id);

        } else {
            modifier.remove(node);
            toSkip.add(declaration);
        }
    }

    function handleFunctionDeclarationOrExpression(node)
    {
        for (let param of node.params) {
            checkRestrictedUsage(param);
        }
    }

    // This whole function goes away
    function handleLegacyNXPropDefinition(node)
    {
        function getInit(typeName) {
            let object = scopeManager.getType(typeName)?.object;

            if (object && (object instanceof Model.Type)) {
                return getInit(object.reference);

            } else if (
                typeName == "number" ||
                (object && (object instanceof Model.Enum))
            ) {
                return "0";

            } else if (typeName == "boolean") {
                return "false";
            }
            
            return "null";
        }
    
        let name = node.key.name;
        let isStatic = node.static;
        let isLegacy = node.legacy;
        let type = TypePrinter.print(node.annotation);

        toSkip.add(node.key);
        toSkip.add(node.annotation);

        let isPrivate  = (node.modifier == "private");
        let isReadOnly = (node.modifier == "readonly");
        let isObserved = (node.modifier == "observed");
        
        let changeArg = "";
        if (node.decorator) {
            changeArg = `"${node.decorator}"`;
            isObserved = true;
        }

        let wantsGetter =  !isPrivate;
        let wantsSetter = (!isPrivate && !isReadOnly);

        let propertyName = name;
        let backingName  = isLegacy ? `_${name}` : `#${name}`;
        let legacySetterName   = isLegacy ? "set" + name[0].toUpperCase() + name.slice(1) : null;

        if (squeezer) {
            propertyName = squeezer.squeeze(propertyName);
            backingName  = squeezer.squeeze(backingName);
            legacySetterName   = legacySetterName ? squeezer.squeeze(legacySetterName) : null;
        }
        
        
        let result = "";
        
        let staticString = isStatic ? "static" : "";
        
        let annotation = "";
        if (language === LanguageTypechecker) {
            annotation = `: ${type}`;
        }

        if (wantsSetter && !currentClass.hasSetter(name, isStatic)) {
            let s = [ ];

            if (isObserved) {
                s.push(`if (this.${backingName} !== arg) {`);
            }

            s.push(`this.${backingName} = arg;`);

            if (isObserved) {
                let changeSymbol = "observePropertyChange";
                
                if (squeezer) changeSymbol = squeezer.squeeze(changeSymbol);
                
                s.push(`this.${changeSymbol}(${changeArg});`);
                s.push(`}`);
            }

            let argType = "";

            result += `${staticString} set ${propertyName}(arg${annotation}) {${s.join(" ")} } `;
        }
            
        if (wantsSetter && legacySetterName) {
            result += `${staticString} ${legacySetterName}(arg${annotation}) {this.${propertyName}=arg;} `; 
        }

        if (wantsGetter && !currentClass.hasGetter(name, isStatic)) {
            result += `${staticString} get ${propertyName}() { return this.${backingName}; } `;
        }

        let initString = "";
        if (isLegacy && !currentClass.hasField(`_${name}`, isStatic)) {
            let annotationValue = node.annotation?.value;
            let initValue = "null";

            if (annotationValue?.type == Syntax.TSTypeReference) {
                initValue = getInit(annotationValue.name.name);
            }
            
            initString = ` = ${initValue};`;
        }
  
        result += `${staticString} ${backingName}${annotation}${initString}`;

        modifier.replace(node, result);
    }


    function handleNXPropDefinition(node)
    {
        if (node.legacy) {
            return handleLegacyNXPropDefinition(node);
        }
    
        let name = node.key.name;
        let isStatic = node.static;
        let type = TypePrinter.print(node.annotation);

        toSkip.add(node.key);
        toSkip.add(node.annotation);

        let isPrivate  = (node.modifier == "private");
        let isReadOnly = (node.modifier == "readonly");
        let isObserved = (node.modifier == "observed");
        
        let changeArg = "";
        if (node.decorator) {
            changeArg = `"${node.decorator}"`;
            isObserved = true;
        }

        let wantsGetter =  !isPrivate;
        let wantsSetter = (!isPrivate && !isReadOnly);

        let propertyName = name;
        let backingName  = `#${name}`;

        if (squeezer) {
            propertyName = squeezer.squeeze(propertyName);
            backingName  = squeezer.squeeze(backingName);
        }
        
        
        let result = "";
        
        let staticString = isStatic ? "static" : "";
        
        let annotation = "";
        if (language === LanguageTypechecker) {
            annotation = `: ${type}`;
        }

        if (wantsSetter && !currentClass.hasSetter(name, isStatic)) {
            let s = [ ];

            if (isObserved) {
                s.push(`if (this.${backingName} !== arg) {`);
            }

            s.push(`this.${backingName} = arg;`);

            if (isObserved) {
                let changeSymbol = "observePropertyChange";
                
                if (squeezer) changeSymbol = squeezer.squeeze(changeSymbol);
                
                s.push(`this.${changeSymbol}(${changeArg});`);
                s.push(`}`);
            }

            let argType = "";

            result += `${staticString} set ${propertyName}(arg${annotation}) {${s.join(" ")} } `;
        }
            
        if (wantsGetter && !currentClass.hasGetter(name, isStatic)) {
            result += `${staticString} get ${propertyName}() { return this.${backingName}; } `;
        }

        result += `${staticString} ${backingName}${annotation}`;

        if (node.value) {
            result += " = ";
            modifier.replace(node.start, node.value.start, result);
        } else {
            modifier.replace(node, result);
        }
    }

    function handleNXFuncDefinition(node)
    {
        let isStatic = node.static;
        let baseName = node.key.name;
    
        if (language === LanguageTypechecker && baseName == "init") {
            if (node.annotation) {
                modifier.remove(node.annotation);
                toSkip.add(node.annotation);
            }
            
            let bodyNodes = node.body.body;
            if (bodyNodes.length > 0) {
                modifier.insert(bodyNodes[bodyNodes.length - 1].end, " return this;");
            } else {
                modifier.replace(node.body, "{ return this; }");
            }
        }

        modifier.replace(node.start, node.key.start, isStatic ? "static " : "");
        
        let funcName = node.nx_func;
        let keyReplacement = funcName ?? baseName;
        
        if (squeezer) {
            keyReplacement = squeezer.squeeze(keyReplacement);
        }
        
        if (keyReplacement != baseName) {
            modifier.replace(node.key, keyReplacement);
            toSkip.add(node.key);
        }
    }

    function handleNXFuncParameter(node)
    {
        if (node.label) {
            modifier.remove(node.label);
            toSkip.add(node.label);
        }
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (toSkip.has(node)) return Traverser.SkipNode;

        if (shouldRemove(node)) {
            modifier.remove(node);
            return Traverser.SkipNode;
        }

        scopeManager.reenterNode(node);

        if (type === Syntax.ImportDeclaration) {
            handleImportDeclaration(node);
            if (language != LanguageTypechecker) return Traverser.SkipNode;

        } else if (type === Syntax.ExportNamedDeclaration) {
            handleExportDeclaration(node);

        } else if (type === Syntax.ClassDeclaration || type == Syntax.ClassExpression) {
            handleClassDeclaration(node);
        
        } else if (type === Syntax.CallExpression) {
            handleCallExpression(node);

        } else if (type === Syntax.NewExpression) {
            handleNewExpression(node);

        } else if (type === Syntax.NXAsExpression) {
            handleNXAsExpression(node);

        } else if (type === Syntax.NXNonNullExpression) {
            handleNXNonNullExpression(node);

        } else if (type === Syntax.TSTypeAnnotation) {
            handleTSTypeAnnotation(node, parent);

        } else if (type === Syntax.NXGlobalDeclaration) {
            handleNXGlobalDeclaration(node);

        } else if (type === Syntax.Identifier) {
            handleIdentifier(node, parent);

        } else if (type === Syntax.MemberExpression) {
            handleMemberExpression(node, parent);

        } else if (type === Syntax.VariableDeclaration) {
            handleVariableDeclaration(node);

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression || type === Syntax.ArrowFunctionExpression) {
            handleFunctionDeclarationOrExpression(node);

        } else if (type === Syntax.PropertyDefinition) {
            handlePropertyDefinition(node);

        } else if (type === Syntax.MethodDefinition) {
            handleMethodDefinition(node);

        } else if (type === Syntax.NXPropDefinition) {
            handleNXPropDefinition(node);

        } else if (type === Syntax.NXFuncDefinition) {
            handleNXFuncDefinition(node);

        } else if (type === Syntax.NXFuncParameter) {
            handleNXFuncParameter(node);
        }

        
    }, function(node, parent) {
        let type = node.type;
        
        scopeManager.exitNode(node);

        if (type === Syntax.ClassDeclaration || type === Syntax.ClassExpression) {
            currentClass = classStack.pop();
        }
    });

    for (let warning of warnings) {
        warning.addFile(filePath);
    }

    let lines = modifier.finish().split("\n");

    if (lines.length && (language === LanguageEcmascript)) {
        lines[0] = `(function(){ "use strict";` + lines[0];
        lines[lines.length - 1] += "})();";    
    }
    
    return { lines, warnings };
}

}
