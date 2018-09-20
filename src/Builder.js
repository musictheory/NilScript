/*
    Builder.js
    Scans AST and builds internal model
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const esprima    = require("../ext/esprima");
const Syntax     = esprima.Syntax;

const NSError    = require("./Errors").NSError;
const Traverser  = require("./Traverser");
const Utils      = require("./Utils");
const Model      = require("./model");


module.exports = class Builder {

constructor(file, model, options)
{
    this._file    = file;
    this._model   = model;
    this._options = options;
}


build()
{
    let nsFile = this._file;
    let model  = this._model;

    let traverser = new Traverser(nsFile.ast);

    let currentClass, currentMethod, currentCategoryName;
    let currentProtocol;

    let usedSelectorMap   = { };

    let declaredClasses   = [ ];
    let declaredGlobals   = [ ];
    let declaredProtocols = [ ];
    let declaredTypes     = [ ];

    let declaredEnums     = [ ];

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

        return new Model.NSMethod(makeLocation(node), selectorName, selectorType, returnType, parameterTypes, variableNames, optional);
    }


    function handleNSClassImplementation(node)
    {
        let className      = node.id.name;
        let superclassName = node.superClass && node.superClass.name;
        let categoryName   = node.category;
        let protocolNames  = [ ];
        let result;

        if (node.extension) {
            Utils.throwError(NSError.NotYetSupported, "Class extensions are not yet supported", node);
        }

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                protocolNames.push(protocol.name);
            });
        }

        let nsClass;
        if (categoryName) {
            nsClass = model.classes[className];

            if (!nsClass) {
                nsClass = new Model.NSClass(null, className);
                nsClass.placeholder = true;
                model.addClass(nsClass);
            }

        } else {
            nsClass = new Model.NSClass(makeLocation(node), className, superclassName, protocolNames);
            model.addClass(nsClass);
        }

        if (superclassName) {
            let superclass = new Model.NSClass(null, superclassName);
            superclass.placeholder = true;
            model.addClass(superclass);
        }

        currentClass = nsClass;
        currentCategoryName = categoryName;

        declaredClasses.push(nsClass.name)
    }

    function handleNSProtocolDefinition(node)
    {
        let name = node.id.name;
        let parentProtocolNames  = [ ];

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                parentProtocolNames.push(protocol.name);
            });
        }

        let nsProtocol = new Model.NSProtocol(makeLocation(node), name, parentProtocolNames);
        model.addProtocol(nsProtocol);

        currentProtocol = nsProtocol;

        declaredProtocols.push(nsProtocol.name);
    }
 
    function handleNSMethodDefinition(node)
    {
        let method = makeNSMethodNode(node);
        currentClass.addMethod(method);
        currentMethod = method;
    }

    function handleNSMethodDeclaration(node)
    {
        let method = makeNSMethodNode(node);
        currentProtocol.addMethod(method);
    }

    function handleInstanceVariableDeclaration(node)
    {
        let type = node.parameterType ? node.parameterType.value : null;

        for (let i = 0, length = node.ivars.length; i < length; i++) {
            let name = node.ivars[i].name;
            currentClass.addIvar(new Model.NSIvar(makeLocation(node), name, currentClass.name, type));
        }
    }

    function handleNSPropertyDirective(node)
    {
        let name = node.id.name;

        let type        = node.id.annotation.value;
        let writable    = true;
        let getter      = name;
        let setter      = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + ":";
        let copyOnRead  = false;
        let copyOnWrite = false;

        if (currentCategoryName) {
            Utils.throwError(NSError.NotYetSupported, "@property is not yet supported in a category's implementation", node);
        }

        for (let i = 0, length = node.attributes.length; i < length; i++) {
            let attribute = node.attributes[i];
            let attributeName = attribute.name;

            if (attributeName == "readonly") {
                writable = false;
            } else if (attribute.name == "readwrite") {
                writable = true;
            } else if (attributeName == "getter") {
                getter = attribute.selector.selectorName;
            } else if (attributeName == "setter") {
                setter = attribute.selector.selectorName;
            } else if (attributeName == "copy") {
                copyOnWrite = true;
            } else if (attributeName == "struct") {
                copyOnWrite = true;
                copyOnRead  = true;
            } else if (attributeName == "class") {
                Utils.throwError(NSError.NotYetSupported, "@property 'class' attribute is not supported", node);

            } else {
                Utils.throwError(NSError.UnknownPropertyAttribute, "Unknown property attribute: '" + attributeName + "'", node);
            }
        }

        if (!writable) {
            setter = null;
        }

        let property = new Model.NSProperty(makeLocation(node), name, type, writable, copyOnRead, copyOnWrite, getter, setter, null);
        if (currentClass) {
            currentClass.addProperty(property);
        } else if (currentProtocol) {
            currentProtocol.addProperty(property);
        }
    }        

    function handleNSObserveDirective(node)
    {
        let hasSet    = false;
        let hasChange = false;
        let before    = null;
        let after     = null;

        for (let i = 0, length = node.attributes.length; i < length; i++) {
            let attribute = node.attributes[i];
            let attributeName = attribute.name;

            if (attributeName == "before") {
                before = attribute.selector.selectorName;
            } else if (attributeName == "after") {
                after = attribute.selector.selectorName;
            } else if (attributeName == "change") {
                hasChange = true;
            } else if (attributeName == "set") {
                hasSet = true;
            }
        }

        if (hasSet && hasChange) {
            Utils.throwError(NSError.NotYetSupported, "@observe 'change' and 'set' attributes are mutually exclusive", node);
        }

        for (let i = 0, length = node.ids.length; i < length; i++) {
            let name = node.ids[i].name;

            let observer = new Model.NSObserver(makeLocation(node), name, !hasSet, before, after);
            if (currentClass) currentClass.addObserver(observer);
        }
    }           

    function handleNSSynthesizeDirective(node) {
        let pairs = node.pairs;

        if (currentCategoryName) {
            Utils.throwError(NSError.NotYetSupported, "@synthesize is not allowed in a category's implementation", node);
        }

        for (let i = 0, length = pairs.length; i < length; i++) {
            let pair    = pairs[i];
            let name    = pair.id.name;
            let backing = pair.backing ? pair.backing.name : name;

            currentClass.makePropertySynthesized(name, backing);
        }        
    }

    function handleNSDynamicDirective(node) {
        let ids = node.ids;

        if (currentCategoryName) {
            Utils.throwError(NSError.NotYetSupported, "@dynamic is not yet supported in a category's implementation", node);
        }

        for (let i = 0, length = ids.length; i < length; i++) {
            let name = ids[i].name;
            currentClass.makePropertyDynamic(name);
        }
    }

    function handleNSTypeDefinition(node)
    {
        let name = node.name;
        let kind = node.kind;

        let parameterNames    = [ ];
        let parameterTypes    = [ ];
        let parameterOptional = [ ];
        let returnType = node.annotation ? node.annotation.value : null;

        _.each(node.params, param => {
            parameterNames.push(param.name);
            parameterTypes.push(param.annotation ? param.annotation.value : null);
            parameterOptional.push(param.annotation ? param.annotation.optional : null);
        });

        let type = new Model.NSType(name, kind, parameterNames, parameterTypes, parameterOptional, returnType);
        model.addType(type);

        declaredTypes.push(name);
    }

    function handleNSEnumDeclaration(node, parent)
    {
        let length  = node.declarations ? node.declarations.length : 0;
        let last    = node;
        let bridged = (parent.type === Syntax.NSBridgedDeclaration);

        // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger
        function isInteger(nVal) {
            return typeof nVal === "number" && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
        }

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
            if (!isInteger(value)) {
                Utils.throwError(NSError.NonIntegerEnum, "Use of non-integer value with @enum", literalNode || initNode);
            }

            return negative ? -value : value;
        }

        let name = node.id ? node.id.name : null;
        let e = new Model.NSEnum(makeLocation(node), name, node.unsigned, bridged);

        if (name) {
            declaredEnums.push(name);
        }

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

                e.addValue(declaration.id.name, currentValue);
                model.registerDeclaration(declaration.id.name, declaration);

                declaration.enumValue = currentValue;

                currentValue++;
            }
        }

        model.addEnum(e);
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

                if      (raw == "YES")   raw = "true";
                else if (raw == "NO")    raw = "false";
                else if (raw == "NULL")  raw = "null";
                else if (raw == "nil")   raw = "null";

            } else if (initType === Syntax.UnaryExpression && _.isNumber(declaration.init.argument.value)) {
                value = -declaration.init.argument.value;
                raw   = JSON.stringify(value);

            } else {
                Utils.throwError(NSError.NonLiteralConst, "Use of non-literal value with @const", node);
            }

            let nsConst = new Model.NSConst(makeLocation(node), declaration.id.name, value, raw, bridged);
            model.addConst(nsConst);
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

            model.addGlobal(new Model.NSGlobal(node, name, annotation));
            model.getSymbolTyper().enrollForSqueezing(name);

            declaredGlobals.push(name);
        }

        if (inNode.declaration) {
            addGlobalWithNode(inNode.declaration);

        } else {
            _.each(inNode.declarators, function(declarator) {
                addGlobalWithNode(declarator);
            });
        }
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
            if (type === Syntax.NSClassImplementation) {
                handleNSClassImplementation(node);

            } else if (type === Syntax.NSProtocolDefinition) {
                handleNSProtocolDefinition(node);

            } else if (type === Syntax.NSInstanceVariableDeclaration) {
                handleInstanceVariableDeclaration(node);

            } else if (type === Syntax.NSPropertyDirective) {
                handleNSPropertyDirective(node);

            } else if (type === Syntax.NSObserveDirective) {
                handleNSObserveDirective(node);

            } else if (type === Syntax.NSSynthesizeDirective) {
                handleNSSynthesizeDirective(node);

            } else if (type === Syntax.NSDynamicDirective) {
                handleNSDynamicDirective(node);

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

            } else if (type === Syntax.VariableDeclarator) {
                handleVariableDeclarator(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                handleFunctionDeclarationOrExpression(node);

            } else if (type === Syntax.NSMessageExpression) {
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
            currentCategoryName = null;

        } else if (type === Syntax.NSProtocolDefinition) {
            currentProtocol = null;

        } else if (type === Syntax.NSMethodDefinition) {
            currentMethod = null;
        }
    });

    nsFile.uses = {
        selectors: _.keys(usedSelectorMap).sort()
    };

    nsFile.declares = {
        classes:   declaredClasses.sort(),
        globals:   declaredGlobals.sort(),
        protocols: declaredProtocols.sort(),
        types:     declaredTypes.sort(),
        enums:     declaredEnums.sort()
    };
}


}
