/*
    Builder.js
    Scans AST and builds internal model
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _ from "lodash";

import { NSError   } from "./Errors.js";
import { Syntax    } from "./Parser.js";
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
    let currentClass, currentMethod, currentMethodNode;
    let currentProtocol;
    let functionCount = 0;
    
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

    function makeNSMethodNode(node)
    {
        let selectorName    = node.selectorName;
        let selectorType    = node.selectorType;
        let methodSelectors = node.methodSelectors;
        let optional        = node.optional;

        let variableNames  = [ ];
        let parameterTypes = [ ];

        let methodType, variableName;
        for (let i = 0, length = (methodSelectors.length || 0); i < length; i++) {
            methodType   = methodSelectors[i].methodType;
            variableName = methodSelectors[i].variableName;

            if (methodType) {
                parameterTypes.push(methodType.value);
            } else if (variableName) {
                parameterTypes.push("id");
            }

            if (variableName) {
                variableNames.push(variableName.name);
            }
        }

        let returnType;
        if (node.returnType) returnType = node.returnType.value;
        if (!returnType) returnType = "id";

        return new NSMethod(makeLocation(node), selectorName, selectorType, returnType, parameterTypes, variableNames, optional);
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

    function handleNXClassDeclaration(node)
    {
        let className = node.id.name;

        node.nxClass = new NXClass(makeLocation(node), className, node.superClass);
        currentNXClass = node.nxClass;
    }

    function handleNSClassImplementation(node)
    {
        let className    = node.id.name;
        let result;

        let inheritedNames = node.inheritanceList ?
            _.map(node.inheritanceList.ids, id => id.name) :
            [ ];

        let nsClass = new NSClass(makeLocation(node), className, inheritedNames);
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
 
    function handleNSMethodDefinition(node)
    {
        let method = makeNSMethodNode(node);
        currentClass.addMethod(method);
        currentMethod = method;
        currentMethodNode = node;
        functionCount = 0;
    }

    function handleNSMethodDeclaration(node)
    {
        let method = makeNSMethodNode(node);
        currentProtocol.addMethod(method);
    }

    function handleNSPropertyDirective(node)
    {
        let getterName    = null;
        let getterEnabled = true;

        let setterName    = null;
        let setterEnabled = true;

        let changeName    = null;

        for (let i = 0, length = node.attributes.length; i < length; i++) {
            let attribute = node.attributes[i];
            let attributeName = attribute.name;

            if (attributeName == "readonly") {
                getterEnabled = true;
                setterEnabled = false; 

            } else if (attributeName == "readwrite") {
                getterEnabled = true;
                setterEnabled = true; 
               
            } else if (attributeName == "private") {
                getterEnabled = false;
                setterEnabled = false; 

            } else if (attributeName == "getter") {
                getterName = attribute.selector.selectorName;

            } else if (attributeName == "setter") {
                setterName = attribute.selector.selectorName;

            } else if (attributeName == "change") {
                changeName = attribute.selector.selectorName;

            } else if (attributeName == "class") {
                Utils.throwError(NSError.NotYetSupported, "'class' attribute is not supported", node);

            } else {
                Utils.throwError(NSError.UnknownPropertyAttribute, `Unknown property attribute: "${attributeName}"`, node);
            }
        }


        let type = node.id.annotation.value;
        let name = node.id.name;

        let getter = getterEnabled ? {
            name: getterName || name,
        } : null;

        let setter = setterEnabled ? {
            name: setterName || ("set" + name[0].toUpperCase() + name.slice(1) + ":"),
            change: changeName
        } : null;

        let property = new NSProperty(makeLocation(node), name, type, "_" + name, getter, setter);

        if (currentClass) {
            currentClass.addProperty(property);
        } else if (currentProtocol) {
            currentProtocol.addProperty(property);
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
        let name = node.name;
        let transformable = isIdentifierTransformable(node);

        if (
            currentMethodNode &&
            currentClass &&
            parent.type == Syntax.MemberExpression &&
            parent.computed == false &&
            parent.object.type == Syntax.ThisExpression
        ) {
            if ((name[0] == "_") && (name.length > 1)) {
                currentClass.markUsedIvar(name);
            }
        }

        node.ns_transformable = transformable;
    }

    function handleVariableDeclarator(node)
    {
        if (node.id.name == "self" && currentMethod) {
            Utils.throwError(NSError.SelfIsReserved, "Use of self as variable name inside of NilScript method", node);
        }
    }

    function handleFunctionDeclarationOrExpression(node)
    {
        if (currentMethod) {
            for (let i = 0, length = node.params.length; i < length; i++) {
                let param = node.params[i];

                if (param.name == "self") {
                    Utils.throwError(NSError.SelfIsReserved, "Use of self as function parameter name", node);
                }
            }
        }
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (parent) {
            node.ns_parent = parent;
        }

        try {
            if (type === Syntax.NXClassDeclaration) {
                handleNXClassDeclaration(node);

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

            } else if (type === Syntax.NSPropertyDirective) {
                handleNSPropertyDirective(node);

            } else if (type === Syntax.NSTypeDefinition) {
                handleNSTypeDefinition(node);

            } else if (type === Syntax.NSMethodDefinition) {
                handleNSMethodDefinition(node);

            } else if (type === Syntax.NSMethodDeclaration) {
                handleNSMethodDeclaration(node);

            } else if (type === Syntax.NSEnumDeclaration) {
                handleNSEnumDeclaration(node, parent);

            } else if (type === Syntax.NSConstDeclaration) {
                handleNSConstDeclaration(node, parent);

            } else if (type === Syntax.NSGlobalDeclaration) {
                handleNSGlobalDeclaration(node);

            } else if (type === Syntax.Identifier) {
                handleIdentifier(node, parent);

            } else if (type === Syntax.VariableDeclarator) {
                handleVariableDeclarator(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                functionCount++;
                handleFunctionDeclarationOrExpression(node);

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
            currentMethod = null;
            currentMethodNode = null;

        } else if (type === Syntax.NSProtocolDefinition) {
            currentProtocol = null;

        } else if (type === Syntax.NSMethodDefinition) {
            currentMethod = null;
            currentMethodNode = null;

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
            functionCount--;

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
