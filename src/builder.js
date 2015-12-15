/*
    builder.js
    Scans AST and builds internal model
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const esprima    = require("../ext/esprima");
const Syntax     = esprima.Syntax;

const OJError    = require("./errors").OJError;
const Traverser  = require("./traverser");
const Utils      = require("./utils");
const Model      = require("./model");


function sMakeOJMethodForNode(node)
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

    return new Model.OJMethod(selectorName, selectorType, returnType, parameterTypes, variableNames, optional);
}


module.exports = class Builder {

constructor(file, model, options)
{
    this._file    = file;
    this._model   = model;
    this._options = options;
}


build()
{
    let ojFile = this._file;
    let model  = this._model;

    let traverser = new Traverser(ojFile.ast);

    let currentClass, currentMethod, currentCategoryName;
    let currentStruct, currentProtocol;

    let usedSelectorMap   = { };

    let declaredClasses   = [ ];
    let declaredGlobals   = [ ];
    let declaredProtocols = [ ];
    let declaredStructs   = [ ];
    let declaredEnums     = [ ];


    function handleOJClassImplementation(node)
    {
        let className      = node.id.name;
        let superclassName = node.superClass && node.superClass.name;
        let categoryName   = node.category;
        let protocolNames  = [ ];
        let result;

        if (node.extension) {
            Utils.throwError(OJError.NotYetSupported, "Class extensions are not yet supported", node);
        }

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                protocolNames.push(protocol.name);
            });
        }

        let ojClass;
        if (categoryName) {
            ojClass = model.classes[className];

            if (!ojClass) {
                ojClass = new Model.OJClass(className);
                ojClass.placeholder = true;
                model.addClass(ojClass);
            }

        } else {
            ojClass = new Model.OJClass(className, superclassName, protocolNames);
            ojClass.forward = false;
            ojClass.location = _.clone(node.loc);
            model.addClass(ojClass);
        }

        if (superclassName) {
            let superclass = new Model.OJClass(superclassName);
            superclass.forward = true;
            model.addClass(superclass);
        }

        currentClass = ojClass;
        currentCategoryName = categoryName;

        declaredClasses.push(ojClass.name)
    }

    function handleOJStructDefinition(node)
    {
        let ojStruct = new Model.OJStruct(node.id.name);
        model.addStruct(ojStruct);

        currentStruct = ojStruct;

        declaredStructs.push(ojStruct.name);
    }

    function handleOJProtocolDefinition(node)
    {
        let name = node.id.name;
        let parentProtocolNames  = [ ];

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                parentProtocolNames.push(protocol.name);
            });
        }

        let ojProtocol = new Model.OJProtocol(name, parentProtocolNames);
        model.addProtocol(ojProtocol);
        ojProtocol.location = _.clone(node.loc);
        currentProtocol = ojProtocol;

        declaredProtocols.push(ojProtocol.name);
    }

    function handleOJClassDirective(node)
    {
        let ids = node.ids;

        for (let i = 0, length = ids.length; i < length; i++) {
            let cls = new Model.OJClass(ids[i].name);
            cls.forward = true;

            model.addClass(cls);
        }
    }
 
    function handleOJSqueezeDirective(node)
    {
        node.ids.forEach(function(id) {
            model.getSymbolTyper().enrollForSqueezing(id.name);
        });
    }

    function handleOJMethodDefinition(node)
    {
        let method = sMakeOJMethodForNode(node, null);
        currentClass.addMethod(method);
        currentMethod = method;
    }

    function handleOJMethodDeclaration(node)
    {
        let method = sMakeOJMethodForNode(node);
        currentProtocol.addMethod(method);
    }

    function handleOJBracketVariableDeclaration(node)
    {
        let type = node.parameterType ? node.parameterType.value : null;

        for (let i = 0, length = node.ids.length; i < length; i++) {
            let name = node.ids[i].name;

            if (currentClass) {
                currentClass.addIvar(new Model.OJIvar(name, currentClass.name, type));
            } else if (currentStruct) {
                currentStruct.addVariable(name, type);
            }
        }
    }

    function handleOJPropertyDirective(node)
    {
        let name = node.id.name;

        let type     = node.parameterType ? node.parameterType.value : "id";
        let writable = true;
        let getter   = name;
        let setter   = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + ":";

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@property is not yet supported in a category's implementation", node);
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
            }
        }

        if (!writable) {
            setter = null;
        }

        let property = new Model.OJProperty(name, type, writable, getter, setter, null);
        if (currentClass) {
            currentClass.addProperty(property);
        } else if (currentProtocol) {
            currentProtocol.addProperty(property);
        }
    }        

    function handleOJSynthesizeDirective(node) {
        let pairs = node.pairs;

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@synthesize is not allowed in a category's implementation", node);
        }

        for (let i = 0, length = pairs.length; i < length; i++) {
            let pair    = pairs[i];
            let name    = pair.id.name;
            let backing = pair.backing ? pair.backing.name : name;

            currentClass.makePropertySynthesized(name, backing);
        }        
    }

    function handleOJDynamicDirective(node) {
        let ids = node.ids;

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@dynamic is not yet supported in a category's implementation", node);
        }

        for (let i = 0, length = ids.length; i < length; i++) {
            let name = ids[i].name;
            currentClass.makePropertyDynamic(name);
        }
    }

    function handleOJTypedefDeclaration(node)
    {
        model.aliasType(node.from, node.to);
    }

    function handleOJEnumDeclaration(node, parent)
    {
        let length  = node.declarations ? node.declarations.length : 0;
        let last    = node;
        let bridged = (parent.type === Syntax.OJBridgedDeclaration);

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
                Utils.throwError(OJError.NonLiteralEnum, "Use of non-literal value with @enum", literalNode || initNode);
            }

            let value = literalNode.value;
            if (!isInteger(value)) {
                Utils.throwError(OJError.NonIntegerEnum, "Use of non-integer value with @enum", literalNode || initNode);
            }

            return negative ? -value : value;
        }

        let name = node.id ? node.id.name : null;
        let e = new Model.OJEnum(name, node.unsigned, bridged);

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

                declaration.enumValue = currentValue;

                currentValue++;
            }
        }

        model.addEnum(e);
    }

    function handleOJConstDeclaration(node, parent)
    {
        let length  = node.declarations ? node.declarations.length : 0;
        let values  = [ ];
        let bridged = (parent.type === Syntax.OJBridgedDeclaration);

        for (let i = 0; i < length; i++) {
            let declaration = node.declarations[i];

            if (declaration.init.type === Syntax.Literal) {
                let raw = declaration.init.raw;

                if      (raw == "YES")   raw = "true";
                else if (raw == "NO")    raw = "false";
                else if (raw == "NULL")  raw = "null";
                else if (raw == "nil")   raw = "null";

                values.push(raw);

            } else if (declaration.init.type === Syntax.UnaryExpression) {
                values.push(-declaration.init.argument.raw);

            } else {
                Utils.throwError(OJError.NonLiteralConst, "Use of non-literal value with @const", node);
            }
        }

        for (let i = 0; i < length; i++) {
            let declaration = node.declarations[i];
            let ojConst = new Model.OJConst(declaration.id.name, values[i], bridged);
            model.addConst(ojConst);
        }
    }

    function handleOJGlobalDeclaration(inNode)
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

            model.addGlobal(new Model.OJGlobal(name, annotation));
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
            Utils.throwError(OJError.SelfIsReserved, "Use of self as variable name inside of oj method", node);
        }
    }

    function handleFunctionDeclarationOrExpression(node)
    {
        if (currentMethod) {
            for (let i = 0, length = node.params.length; i < length; i++) {
                let param = node.params[i];

                if (param.name == "self") {
                    Utils.throwError(OJError.SelfIsReserved, "Use of self as function parameter name", node);
                }
            }
        }
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (parent) {
            node.oj_parent = parent;
        }

        try {
            if (type === Syntax.OJClassImplementation) {
                handleOJClassImplementation(node);

            } else if (type === Syntax.OJStructDefinition) {
                handleOJStructDefinition(node);

            } else if (type === Syntax.OJProtocolDefinition) {
                handleOJProtocolDefinition(node);

            } else if (type === Syntax.OJClassDirective) {
                handleOJClassDirective(node);

            } else if (type === Syntax.OJSqueezeDirective) {
                handleOJSqueezeDirective(node);

            } else if (type === Syntax.OJBracketVariableDeclaration) {
                handleOJBracketVariableDeclaration(node);

            } else if (type === Syntax.OJPropertyDirective) {
                handleOJPropertyDirective(node);

            } else if (type === Syntax.OJSynthesizeDirective) {
                handleOJSynthesizeDirective(node);

            } else if (type === Syntax.OJDynamicDirective) {
                handleOJDynamicDirective(node);

            } else if (type === Syntax.OJTypedefDeclaration) {
                handleOJTypedefDeclaration(node);

            } else if (type === Syntax.OJMethodDefinition) {
                handleOJMethodDefinition(node);

            } else if (type === Syntax.OJMethodDeclaration) {
                handleOJMethodDeclaration(node);

            } else if (type === Syntax.OJEnumDeclaration) {
                handleOJEnumDeclaration(node, parent);

            } else if (type === Syntax.OJConstDeclaration) {
                handleOJConstDeclaration(node, parent);

            } else if (type === Syntax.OJGlobalDeclaration) {
                handleOJGlobalDeclaration(node);

            } else if (type === Syntax.VariableDeclarator) {
                handleVariableDeclarator(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                handleFunctionDeclarationOrExpression(node);

            } else if (type === Syntax.OJMessageExpression) {
                usedSelectorMap[node.selectorName] = true;

            } else if (type === Syntax.OJSelectorDirective) {
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
                e.file = ojFile.path;
            }

            throw e;
        }

    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.OJClassImplementation) {
            currentClass  = null;
            currentMethod = null;
            currentCategoryName = null;

        } else if (type === Syntax.OJStructDefinition) {
            currentStruct = null;

        } else if (type === Syntax.OJProtocolDefinition) {
            currentProtocol = null;

        } else if (type === Syntax.OJMethodDefinition) {
            currentMethod = null;
        }
    });

    ojFile.uses = {
        selectors: _.keys(usedSelectorMap).sort()
    };

    ojFile.declares = {
        classes:   declaredClasses.sort(),
        globals:   declaredGlobals.sort(),
        protocols: declaredProtocols.sort(),
        structs:   declaredStructs.sort(),
        enums:     declaredEnums.sort()
    };
}


}
