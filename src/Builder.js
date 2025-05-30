/*
    Builder.js
    Scans AST and builds internal model
    (c) 2013-2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import { Syntax        } from "./ast/Tree.js";
import { Traverser     } from "./ast/Traverser.js";
import { TypePrinter   } from "./ast/TypePrinter.js";
import { ScopeManager  } from "./ScopeManager.js";
import { SymbolUtils   } from "./SymbolUtils.js";
import { Model         } from "./model/Model.js";
import { CompilerIssue } from "./model/CompilerIssue.js";

export class Builder {

constructor(file)
{
    this._didBuild  = false;
    this._modelObjects = [ ];

    this._file = file;
    this._scopeManager = new ScopeManager();
    
    file.scopeManager = this._scopeManager;
}


build()
{
    if (this._didBuild) {
        throw new Error("Cannot call Builder.build() twice");
    }

    let file = this._file;

    let scopeManager = this._scopeManager;
    let modelObjects = this._modelObjects;
    
    this._didBuild = true;

    let traverser = new Traverser(file.ast);

    let currentClass = null;
    let classStack = [ ];
        
    function makeLocation(node) {
        if (node && node.loc && node.loc.start) {
            return {
                path:   file.path,
                line:   node.loc.start.line,
                column: node.loc.start.col
            }
        }

        return null;
    }

    function getFuncLabels(nodes)
    {
        let hasNamedArgument = false;
        let labels = [ ];

        for (let node of nodes) {
            if (node.type === Syntax.NXNamedArgument) {
                hasNamedArgument = true;
                labels.push(node.name.name);
                
            } else if (node.type === Syntax.NXFuncParameter) {
                let label = node.label?.name;
                
                if (label == "_") {
                    labels.push("");
                } else {
                    hasNamedArgument = true;
                    labels.push(label ?? node.name.name);
                }
            
            } else {
                labels.push("");
            }
        }
        
        return hasNamedArgument ? labels : null;
    }

    
/*


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

*/    

    function isIdentifierTransformable(node, parent)
    {
    
    
        /*
            foo["bar"]
        */
    
        if (parent.type === Syntax.MemberExpression) {
            // identifier.x -> true
            if (parent.object === node) {
                return true;

            // x[identifier] =  computed = true
            // x.identifier  = !computed = false
            } else {
                return parent.computed;
            }

        } else if (parent.type === Syntax.Property) {
            // { x: identifier }
            if (parent.value === node) {
                return true;

            // { [identifier]: x } =  computed = true
            // {  identifier : x } = !computed = false
            } else {
                return parent.computed;
            }
        }

        return true;   
    }

    function handleImportDeclaration(node)
    {
        let specifiers = node.specifiers;
        
        if (specifiers.length == 0) {
            throw new CompilerIssue("Side-effect imports are not supported", node);
        }
        
        for (let specifier of specifiers) {
            if (specifier.type === Syntax.ImportDefaultSpecifier) {
                throw new CompilerIssue("Default imports are not supported", node);

            } else if (specifier.type === Syntax.ImportNamespaceSpecifier) {
                throw new CompilerIssue("Namespace imports are not supported", node);

            } else if (specifier.type === Syntax.ImportSpecifier) {
                if (specifier.local.name !== specifier.imported.name) {
                    throw new CompilerIssue("Import 'as' is not supported", node);
                }
                
                let importName = specifier.imported.name;
                file.addImport(importName);
            }
        }
    }

    function handleExportDeclaration(node)
    {
        function notSupported() {
            throw new CompilerIssue("Export type not supported", node);
        }

        function addValue(node) {
            let name = node.id.name;
            file.addExport(name);
            modelObjects.push(new Model.Value(makeLocation(node), name));
        }

        if (
            node.type === Syntax.ExportAllDeclaration ||
            node.type === Syntax.ExportDefaultDeclaration ||
            node.specifiers.length > 0 ||
            node.source
        ) {
            notSupported();  
        }
        
        if (node.declaration.type == Syntax.VariableDeclaration) {
            if (node.declaration.kind != "const") {
                notSupported();
            }
            
            for (let declarator of node.declaration.declarations) {
                addValue(declarator);
            }

        } else if (node.declaration.type == Syntax.FunctionDeclaration) {
            addValue(node.declaration);

        } else if (node.declaration?.id?.name) {
            file.addExport(node.declaration.id.name);

        } else {
            notSupported();
        }
    }

    function handleCallExpression(node)
    {
        let funcLabels = getFuncLabels(node.arguments);

        if (funcLabels) {
            let baseNode = node.callee;
            
            while (baseNode.type !== Syntax.Identifier) {
                if (baseNode.type === Syntax.MemberExpression) {
                    baseNode = baseNode.property;
                } else {
                    throw new CompilerIssue("Cannot use named arguments here.", baseNode);
                }
            }
            
            node.nx_func = SymbolUtils.toFuncIdentifier({
                base: baseNode.name,
                labels: funcLabels
            });

            node.nx_base = baseNode;
        }
    }

    function handleNewExpression(node)
    {
        let funcLabels = getFuncLabels(node.arguments);

        if (funcLabels) {
            node.nx_func = SymbolUtils.toFuncIdentifier({
                base:   "init",
                labels: funcLabels
            });
        }
    }

    function handlePropertyDefinition(node)
    {
        if (currentClass) {
            let isStatic = node.static;
            let isComputed = node.computed;
            
            if (!isComputed) {
                currentClass.addField(node.key.name, isStatic);
            }
        }
    }

    function handleMethodDefinition(node)
    {
        if (currentClass) {
            let isStatic = node.static;
            let kind = node.kind;

            if (kind == "constructor") {
                currentClass.hasConstructor = true;

            } else if (kind == "get") {
                currentClass.addGetter(node.key.name, isStatic);

            } else if (kind == "set") {
                currentClass.addSetter(node.key.name, isStatic);
            }
        }
    }

    function handleNXFuncDefinition(node)
    {
        let funcLabels = getFuncLabels(node.params);

        if (currentClass) {
            currentClass.hasFuncOrProp = true;
        }

        if (funcLabels) {
            node.nx_func = SymbolUtils.toFuncIdentifier({
                base: node.key.name,
                labels: funcLabels
            });
        }
    }

    function handleNXPropDefinition(node)
    {
        if (currentClass) {
            currentClass.hasFuncOrProp = true;
            
            if (!node.legacy) {
                currentClass.addProp(node.key.name);
            }
        }
    }

    function handleClassDeclaration(node, parent)
    {
        let className = node.id?.name ?? null;

        let superClassName = node.superClass?.type == Syntax.Identifier ?
            node.superClass.name :
            null;

        classStack.push(currentClass);
        currentClass = new Model.Class(makeLocation(node), className, superClassName);
        
        scopeManager.declare(currentClass);

        if (parent.type == Syntax.ExportNamedDeclaration) {
            modelObjects.push(currentClass);
        }
    }

    function handleNXEnumDeclaration(node, parent)
    {
        function valueForInit(initNode) {
            let literalNode;
            let negative = false;

            if (initNode.type == Syntax.UnaryExpression) {
                literalNode = initNode.argument;
                negative = true;
                
                if (typeof literalNode.value != "number") {
                    throw new CompilerIssue("Use of non-literal value with enum", initNode);
                }
                
            } else if (initNode.type == Syntax.Literal) {
                literalNode = initNode;
            }

            let value = literalNode?.value;

            if (
                !literalNode ||
                (literalNode.type != Syntax.Literal) ||
                (negative && (typeof value != "number"))
            ) {
                throw new CompilerIssue("Use of non-literal value with enum", literalNode || initNode);
            }

            // if (!Number.isInteger(value)) {
            //     throw new CompilerIssue("Use of non-integer value with enum", literalNode || initNode);
            // }

            return negative ? -value : value;
        }

        let name = node.id ? node.id.name : null;

        let modelEnum = new Model.Enum(makeLocation(node), name);
        let nextValue = 0;
            
        for (let member of node.members) {
            let currentValue;

            if (member.init) {
                currentValue = valueForInit(member.init);
            } else if (nextValue !== undefined) {
                currentValue = nextValue;
            } else {
                throw new CompilerIssue("Enum member must have an initializer", member);
            }
            
            if (typeof currentValue == "number") {
                nextValue = currentValue + 1;
            } else {
                nextValue = undefined;
            }

            modelEnum.addMember(makeLocation(member), member.id.name, currentValue);
        }
        
        scopeManager.declare(modelEnum);

        if (parent.type == Syntax.ExportNamedDeclaration) {
            modelObjects.push(modelEnum);
        }
    }

    function handleNXInterfaceDeclaration(node, parent)
    {
        let modelType = new Model.Type(makeLocation(node), node.id.name, null);

        scopeManager.declare(modelType);
        
        if (parent.type == Syntax.ExportNamedDeclaration) {
            modelObjects.push(modelType);
        }
    }

    function handleNXTypeDeclaration(node, parent)
    {
        let reference = null;

        if (node.annotation.value.type == Syntax.TSTypeReference) {
            reference = node.annotation.value.name.name;        
        }
        
        let modelType = new Model.Type(makeLocation(node), node.id.name, reference);
        
        scopeManager.declare(modelType);

        if (parent.type == Syntax.ExportNamedDeclaration) {
            modelObjects.push(modelType);
        }
    }

    function handleNXGlobalDeclaration(node)
    {
        let declaration = node.declaration;

        if (declaration.type == Syntax.FunctionDeclaration) {
            let name = declaration.id.name;
            let annotation = TypePrinter.print(declaration.annotation);

            let globalFunction = new Model.GlobalFunction(makeLocation(declaration), name, annotation);

            for (let param of declaration.params) {
                if (param.type != Syntax.Identifier) {
                    throw new CompilerIssue("'global' functions may only use simple parameter lists", param);
                }
                
                let paramAnnotation = TypePrinter.print(param.annotation);
                
                globalFunction.addParameter(param.name, !!param.optional, paramAnnotation);
            }            

            modelObjects.push(globalFunction);

        } else if (declaration.type == Syntax.VariableDeclaration) {
            for (let declarator of declaration.declarations) {
                let init = declarator.init;
                let raw, value;

                if (init.type === Syntax.Literal) {
                    value = init.value;
                    raw   = init.raw;

                } else if (
                    init.type === Syntax.UnaryExpression &&
                    (typeof init.argument.value == "number")
                ) {
                    value = -init.argument.value;
                    raw   = JSON.stringify(value);

                } else {
                    throw new CompilerIssue("'global' consts must be initialized to a string or number literal.", node);
                }

                let name = declarator.id.name;
                let globalConst = new Model.GlobalConst(makeLocation(declarator), name, value, raw);
                modelObjects.push(globalConst);
            }
        }
    }

    function handleIdentifier(node, parent)
    {
        node.ns_transformable = isIdentifierTransformable(node, parent);
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        try {
            scopeManager.enterNode(node);

            if (type === Syntax.ImportDeclaration) {
                handleImportDeclaration(node);
                
            } else if (
                type === Syntax.ExportAllDeclaration ||
                type === Syntax.ExportDefaultDeclaration ||
                type === Syntax.ExportNamedDeclaration
            ) {
                handleExportDeclaration(node);

            } else if (
                type === Syntax.ClassDeclaration ||
                type === Syntax.ClassExpression
            ) {
                handleClassDeclaration(node, parent);

            } else if (type === Syntax.NXEnumDeclaration) {
                handleNXEnumDeclaration(node, parent);

            } else if (type === Syntax.NXInterfaceDeclaration) {
                handleNXInterfaceDeclaration(node, parent);

            } else if (type === Syntax.NXTypeDeclaration) {
                handleNXTypeDeclaration(node, parent);

            } else if (type === Syntax.PropertyDefinition) {
                handlePropertyDefinition(node);

            } else if (type === Syntax.MethodDefinition) {
                handleMethodDefinition(node);

            } else if (type === Syntax.NXFuncDefinition) {
                handleNXFuncDefinition(node);

            } else if (type === Syntax.NXPropDefinition) {
                handleNXPropDefinition(node);
                
            } else if (type === Syntax.CallExpression) {
                handleCallExpression(node);

            } else if (type === Syntax.NewExpression) {
                handleNewExpression(node);
    
            } else if (type === Syntax.NXGlobalDeclaration) {
                handleNXGlobalDeclaration(node);

            } else if (type === Syntax.Identifier) {
                handleIdentifier(node, parent);
            }

        } catch (e) {
            if (node) {
                if (!e.line) {
                    e.line    = node.loc.start.line;
                    e.column  = node.loc.start.col;
                }
            }

            if (!e.file) {
                e.file = file.path;
            }

            throw e;
        }

    }, function(node, parent) {
        let type = node.type;
        
        scopeManager.exitNode(node);

        if (type === Syntax.ClassDeclaration || type === Syntax.ClassExpression) {
            currentClass = classStack.pop();
        }
    });
}


addToModel(model)
{
    for (let object of this._modelObjects) {
        model.add(object);
    }
}


}
