/*
    Builder.js
    Scans AST and builds internal model
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _ from "lodash";

import { NSError   } from "./Errors.js";
import { Syntax    } from "./LegacyParser.js";
import { Traverser } from "./Traverser.js";
import { Utils     } from "./Utils.js";

import { NSClass    } from "./model/NSClass.js";
import { NSConst    } from "./model/NSConst.js";
import { NSEnum     } from "./model/NSEnum.js";
import { NSGlobal   } from "./model/NSGlobal.js";
import { NSMethod   } from "./model/NSMethod.js";
import { NSProperty } from "./model/NSProperty.js";
import { NSProtocol } from "./model/NSProtocol.js";
import { NSType     } from "./model/NSType.js";

import { NXClass    } from "./model/NXClass.js";


export class Builder {

constructor()
{
    this._didBuild  = false;
    this._modelObjects = [ ];
}


build(nsFile)
{
    if (this._didBuild) {
        throw new Error("Cannot call Builder.build() twice");
    }
    
    this._didBuild = true;
    
    let traverser = new Traverser(nsFile.ast);

    let currentNXClass;
    let currentClass;
    let currentProtocol;
    
    let usedSelectorMap = { };

    let modelObjects = this._modelObjects;

    let declaredClassNames    = [ ];
    let declaredConstNames    = [ ];
    let declaredEnumNames     = [ ];
    let declaredGlobalNames   = [ ];
    let declaredProtocolNames = [ ];
    let declaredTypeNames     = [ ];

    function makeLocation(node) {
        if (node && node.loc && node.loc.start) {
            return {
                path:   nsFile.path,
                line:   node.loc.start.line,
                column: node.loc.start.col
            }
        }

        return null;
    }

    function isIdentifierTransformable(node)
    {
        let parent = node.ns_parent;

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
            Utils.throwError(NSError.NilScriptImportError, "Side-effect imports are not supported", node);
        }
        
        _.each(node.specifiers, specifier => {
            if (specifier.type === Syntax.ImportDefaultSpecifier) {
                Utils.throwError(NSError.NilScriptImportError, "Default imports are not supported", node);
            } else if (specifier.type === Syntax.ImportNamespaceSpecifier) {
                Utils.throwError(NSError.NilScriptImportError, "Namespace imports are not supported", node);

            } else if (specifier.type === ImportSpecifier) {
                if (specifier.local.name !== specifier.imported.name) {
                    Utils.throwError(NSError.NilScriptImportError, "Import 'as' is not supported", node);
                }
                
                nsFile.addImport(specifier.imported.name);
            }
        });
    }

    function handleExportDeclaration(node)
    {
        if (node.type === Syntax.ExportAllDeclaration) {
            Utils.throwError(NSError.NilScriptExportError, "Default imports are not supported", node);

        } else if (node.type === Syntax.ExportDefaultDeclaration) {
        
        }
    }

    function handleCallExpression(node)
    {
        let hasNamedArgument = false;
        let components = [ ];

        for (let argument of node.arguments) {
            if (argument.type == Syntax.NXNamedArgument) {
                hasNamedArgument = true;
                components.push("_" + argument.name.name.replaceAll("_", "$"));
            } else {
                components.push("_");
            }
        }

        if (hasNamedArgument) {
            let baseNode = node.callee;
            
            while (baseNode.type !== Syntax.Identifier) {
                if (baseNode.type === Syntax.MemberExpression) {
                    baseNode = baseNode.property;
                } else {
                    Utils.throwError(NSError.UnnamedError, "Cannot use named arguments here.", baseNode);
                }
            }

            node.nx_funcName = baseNode.name + components.join("");
            node.nx_baseNode = baseNode;
        }
    }

    function handleNXClassDeclaration(node)
    {
        let className = node.id.name;

        node.nxClass = new NXClass(makeLocation(node), className, node.superClass);
        currentNXClass = node.nxClass;
    }

    function handleNSClassImplementation(node)
    {
        let className = node.id.name;
        let result;

        let superClassName = node.superClass?.name ?? null;
        let interfaceNames = node.interfaces.map(id => id.name);

        let nsClass = new NSClass(makeLocation(node), className, superClassName, interfaceNames);
        modelObjects.push(nsClass);
        declaredClassNames.push(nsClass.name)

        currentClass = nsClass;
    }

    function handleNSProtocolDefinition(node)
    {
        let name = node.id.name;

        let inheritedNames = node.inheritanceList ?
            _.map(node.inheritanceList.ids, id => id.name) :
            [ ];

        let nsProtocol = new NSProtocol(makeLocation(node), name, inheritedNames);
        modelObjects.push(nsProtocol);
        declaredProtocolNames.push(nsProtocol.name);

        currentProtocol = nsProtocol;
    }
     
    function handleMethodDefinition(node, parent)
    {
        if (
            currentClass &&
            parent?.type == Syntax.BlockStatement &&
            parent?.ns_parent?.type == Syntax.NSClassImplementation
        ) {
            let isStatic = node.static;

            if (node.kind == "get") {
                currentClass.addGetter(node.key.name, isStatic, node.value.annotation?.value);
            } else if (node.kind == "set") {
                currentClass.addSetter(node.key.name, isStatic, node.value.params[0]?.annotation?.value);
            }
        }
    }


    function handleNXPropDefinition(node)
    {
        let attributes = [ ];

        let modifier = node.modifier;
        if (modifier) attributes.push(modifier);

        let type = node.annotation.value;
        let name = node.key.name;
        let isStatic = node.static;

        let property = new NSProperty(makeLocation(node), name, type, isStatic, attributes);

        if (currentClass) {
            currentClass.addProperty(property);
        }
    }


    function handleNXFuncDefinition(node)
    {
        let params = node.params.map(param => {
            return {
                label: param.label?.name ?? null,
                name:  param.name.name,
                type:  param.annotation?.value ?? null
            };
        });
        
        let baseName   = node.key.name;
        let returnType = node.annotation?.value ?? null;
        
        let method = new NSMethod(makeLocation(node), baseName, node.static, node.optional ?? false, params, returnType);

        if (currentClass) {
            currentClass.addMethod(method);
        } else if (currentProtocol) {
            currentProtocol.addMethod(method);
        }  
    }


    function handleNSTypeDefinition(node)
    {
        let name = node.name;
        let kind = node.kind;

        let location = makeLocation(node);
        let parameterNames    = [ ];
        let parameterTypes    = [ ];
        let parameterOptional = [ ];
        let returnType = node.annotation ? node.annotation.value : null;

        _.each(node.params, param => {
            parameterNames.push(param.name);
            parameterTypes.push(param.annotation ? param.annotation.value : null);
            parameterOptional.push(param.annotation ? param.annotation.optional : null);
        });

        let nsType = new NSType(location, name, kind, parameterNames, parameterTypes, parameterOptional, returnType);
        modelObjects.push(nsType);
        declaredTypeNames.push(nsType.name);
    }

    function handleNSEnumDeclaration(node, parent)
    {
        let length  = node.declarations ? node.declarations.length : 0;
        let last    = node;
        let bridged = (parent.type === Syntax.NSBridgedDeclaration);

        function valueForInit(initNode) {
            let literalNode;
            let negative = false;

            if (initNode.type == Syntax.UnaryExpression) {
                literalNode = initNode.argument;
                negative = true;
            } else if (initNode.type == Syntax.Literal) {
                literalNode = initNode;
            }

            if (!literalNode || (literalNode.type != Syntax.Literal)) {
                Utils.throwError(NSError.NonLiteralEnum, "Use of non-literal value with @enum", literalNode || initNode);
            }

            let value = literalNode.value;
            if (!Number.isInteger(value)) {
                Utils.throwError(NSError.NonIntegerEnum, "Use of non-integer value with @enum", literalNode || initNode);
            }

            return negative ? -value : value;
        }

        let name = node.id ? node.id.name : null;

        if (!name) {
            Utils.throwError(NSError.UnnamedEnum, "Unnamed @enum", node);
        }

        let nsEnum = new NSEnum(makeLocation(node), name, bridged);
        modelObjects.push(nsEnum);
        declaredEnumNames.push(nsEnum.name);

        if (length) {
            let firstDeclaration = node.declarations[0];
            let lastDeclaration  = node.declarations[length - 1];
            let currentValue = 0;
            let declaration, i;

            for (i = 0; i < length; i++) {
                declaration = node.declarations[i];

                if (declaration.init) {
                    currentValue = valueForInit(declaration.init);
                }

                nsEnum.addMember(makeLocation(declaration), declaration.id.name, currentValue);

                declaration.enumValue = currentValue;

                currentValue++;
            }
        }
    }

    function handleNSConstDeclaration(node, parent)
    {
        let length  = node.declarations ? node.declarations.length : 0;
        let bridged = (parent.type === Syntax.NSBridgedDeclaration);

        for (let i = 0; i < length; i++) {
            let declaration = node.declarations[i];
            let raw;
            let value;

            let initType = declaration.init ? declaration.init.type : null;

            if (initType === Syntax.Literal) {
                value = declaration.init.value;
                raw   = declaration.init.raw;

            } else if (initType === Syntax.UnaryExpression && _.isNumber(declaration.init.argument.value)) {
                value = -declaration.init.argument.value;
                raw   = JSON.stringify(value);

            } else {
                Utils.throwError(NSError.NonLiteralConst, "Use of non-literal value with @const", node);
            }

            let nsConst = new NSConst(makeLocation(node), declaration.id.name, value, raw, bridged);
            modelObjects.push(nsConst);
            declaredConstNames.push(nsConst.name);
        }
    }

    function handleNSGlobalDeclaration(inNode)
    {
        function addGlobalWithNode(node) {
            let name = node.id.name;
            let annotation;

            if (node.type === Syntax.FunctionDeclaration ||
                node.type === Syntax.FunctionExpression)
            {
                annotation = [ ];
                annotation.push(node.annotation ? node.annotation.value : null);

                _.each(node.params, function(param) {
                    annotation.push(param.annotation ? param.annotation.value : null);
                });

            } else {
                annotation = node.id.annotation ? node.id.annotation.value : null;
            }

            let nsGlobal = new NSGlobal(node, name, annotation);
            modelObjects.push(nsGlobal);
            declaredGlobalNames.push(nsGlobal.name);
        }

        if (inNode.declaration) {
            addGlobalWithNode(inNode.declaration);

        } else {
            _.each(inNode.declarators, function(declarator) {
                addGlobalWithNode(declarator);
            });
        }
    }

    function handleIdentifier(node, parent)
    {
        node.ns_transformable = isIdentifierTransformable(node);
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (parent) {
            node.ns_parent = parent;
        }

        if (node.typeAnnotation) {
            node.annotation = node.typeAnnotation;
        }

        try {
            if (type === Syntax.ImportDeclaration) {
                handleImportDeclaration(node);

            } else if (type === Syntax.NXClassDeclaration) {
                handleNXClassDeclaration(node);
    
            } else if (type === Syntax.NXPropDefinition) {
                handleNXPropDefinition(node);
                
            } else if (type === Syntax.NXFuncDefinition) {
                handleNXFuncDefinition(node);

            } else if (currentNXClass && (
                type === Syntax.NXPropDefinition ||
                type === Syntax.NXFuncDefinition ||
                type === Syntax.MethodDefinition ||
                type === Syntax.PropertyDefinition
            )) {
                currentNXClass.addElement(node);

            } else if (type === Syntax.NSClassImplementation) {
                handleNSClassImplementation(node);

            } else if (type === Syntax.NSProtocolDefinition) {
                handleNSProtocolDefinition(node);

            } else if (type === Syntax.NSTypeDefinition) {
                handleNSTypeDefinition(node);

            } else if (type === Syntax.MethodDefinition) {
                handleMethodDefinition(node, parent);
                
            } else if (type === Syntax.CallExpression) {
                handleCallExpression(node);

            } else if (type === Syntax.NSEnumDeclaration) {
                handleNSEnumDeclaration(node, parent);

            } else if (type === Syntax.NSConstDeclaration) {
                handleNSConstDeclaration(node, parent);

            } else if (type === Syntax.NSGlobalDeclaration) {
                handleNSGlobalDeclaration(node);

            } else if (type === Syntax.Identifier) {
                handleIdentifier(node, parent);

            } else if (type === Syntax.NSMessageExpression) {
                if (node.selectorName == "alloc") {
                    node.ns_nonnull = true;
                }

                usedSelectorMap[node.selectorName] = true;

            } else if (type === Syntax.NSSelectorDirective) {
                usedSelectorMap[node.name] = true;
            }

        } catch (e) {
            if (node) {
                if (!e.line) {
                    e.line    = node.loc.start.line;
                    e.column  = node.loc.start.col;
                }
            }

            if (!e.file) {
                e.file = nsFile.path;
            }

            throw e;
        }

    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.NSClassImplementation) {
            currentClass  = null;

        } else if (type === Syntax.NSProtocolDefinition) {
            currentProtocol = null;

        } else if (type === Syntax.NXClassDeclaration) {
            currentNXClass = null;        
        }
    });

    nsFile.uses = {
        selectors: _.keys(usedSelectorMap).sort()
    };

    nsFile.declares = {
        classes:   _.filter(declaredClassNames   ).sort(),
        globals:   _.filter(declaredGlobalNames  ).sort(),
        protocols: _.filter(declaredProtocolNames).sort(),
        types:     _.filter(declaredTypeNames    ).sort(),
        enums:     _.filter(declaredEnumNames    ).sort(),
    };
}


addToModel(model)
{
    _.each(this._modelObjects, modelObject => {
        if (modelObject instanceof NSClass) {
            model.addClass(modelObject);

        } else if (modelObject instanceof NSConst) {
            model.addConst(modelObject);

        } else if (modelObject instanceof NSEnum) {
            model.addEnum(modelObject);

        } else if (modelObject instanceof NSGlobal) {
            model.addGlobal(modelObject);
        
        } else if (modelObject instanceof NSProtocol) {
            model.addProtocol(modelObject);

        } else if (modelObject instanceof NSType) {
            model.addType(modelObject);
        }
    });
}


}
