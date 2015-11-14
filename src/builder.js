/*
    builder.js
    Scans AST and builds internal model
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var _          = require("lodash");
var esprima    = require("../ext/esprima");
var Syntax     = esprima.Syntax;

var Modifier   = require("./modifier");
var OJError    = require("./errors").OJError;
var Traverser  = require("./traverser");
var Utils      = require("./utils");
var Model      = require("./model");


function Builder(ast, model, options)
{
    this._ast     = ast;
    this._model   = model;
    this._options = options;
}


function sMakeOJMethodForNode(node)
{
    var selectorName    = node.selectorName;
    var selectorType    = node.selectorType;
    var methodSelectors = node.methodSelectors;
    var optional        = node.optional;

    var variableNames  = [ ];
    var parameterTypes = [ ];

    var methodType, variableName;
    for (var i = 0, length = (methodSelectors.length || 0); i < length; i++) {
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

    var returnType;
    if (node.returnType) returnType = node.returnType.value;
    if (!returnType) returnType = "id";

    return new Model.OJMethod(selectorName, selectorType, returnType, parameterTypes, variableNames, optional);
}


Builder.prototype.build = function()
{
    var compiler     = this;
    var model        = this._model;

    var currentClass, currentMethod, currentCategoryName;
    var currentStruct, currentProtocol;

    var traverser = new Traverser(this._ast);

    function handleOJClassImplementation(node)
    {
        var className      = node.id.name;
        var superclassName = node.superClass && node.superClass.name;
        var categoryName   = node.category;
        var protocolNames  = [ ];
        var result;

        if (node.extension) {
            Utils.throwError(OJError.NotYetSupported, "Class extensions are not yet supported", node);
        }

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                protocolNames.push(protocol.name);
            });
        }

        var cls;
        if (categoryName) {
            cls = model.classes[className];

            if (!cls) {
                cls = new Model.OJClass(className);
                cls.placeholder = true;
                model.addClass(cls);
            }

        } else {
            cls = new Model.OJClass(className, superclassName, protocolNames);
            cls.forward = false;
            cls.location = _.clone(node.loc);
            model.addClass(cls);
        }

        if (superclassName) {
            var superclass = new Model.OJClass(superclassName);
            superclass.forward = true;
            model.addClass(superclass);
        }

        currentClass = cls;
        currentCategoryName = categoryName;
    }

    function handleOJStructDefinition(node)
    {
        var struct = new Model.OJStruct(node.id.name);
        model.addStruct(struct);

        currentStruct = struct;
    }

    function handleOJProtocolDefinition(node)
    {
        var name = node.id.name;
        var parentProtocolNames  = [ ];

        if (node.protocolList) {
            _.each(node.protocolList.protocols, function(protocol) {
                parentProtocolNames.push(protocol.name);
            });
        }

        var protocol = new Model.OJProtocol(name, parentProtocolNames);
        model.addProtocol(protocol);
        protocol.location = _.clone(node.loc);
        currentProtocol = protocol;
    }

    function handleOJClassDirective(node)
    {
        var ids = node.ids;
        var i, length;

        for (var i = 0, length = ids.length; i < length; i++) {
            var cls = new Model.OJClass(ids[i].name);
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
        var method = sMakeOJMethodForNode(node, null);
        currentClass.addMethod(method);
        currentMethod = method;
    }

    function handleOJMethodDeclaration(node)
    {
        var method = sMakeOJMethodForNode(node);
        currentProtocol.addMethod(method);
    }

    function handleOJBracketVariableDeclaration(node)
    {
        var type = node.parameterType ? node.parameterType.value : null;

        for (var i = 0, length = node.ids.length; i < length; i++) {
            var name = node.ids[i].name;

            if (currentClass) {
                currentClass.addIvar(new Model.OJIvar(name, currentClass.name, type));
            } else if (currentStruct) {
                currentStruct.addVariable(name, type);
            }
        }
    }

    function handleOJPropertyDirective(node)
    {
        var name = node.id.name;

        var type     = node.parameterType ? node.parameterType.value : "id";
        var writable = true;
        var getter   = name;
        var setter   = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + ":";

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@property is not yet supported in a category's implementation", node);
        }

        for (var i = 0, length = node.attributes.length; i < length; i++) {
            var attribute = node.attributes[i];
            var attributeName = attribute.name;

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

        var property = new Model.OJProperty(name, type, writable, getter, setter, null);
        currentClass.addProperty(property);
    }        

    function handleOJSynthesizeDirective(node) {
        var pairs = node.pairs;

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@synthesize is not allowed in a category's implementation", node);
        }

        for (var i = 0, length = pairs.length; i < length; i++) {
            var pair    = pairs[i];
            var name    = pair.id.name;
            var backing = pair.backing ? pair.backing.name : name;

            currentClass.makePropertySynthesized(name, backing);
        }        
    }

    function handleOJDynamicDirective(node) {
        var ids = node.ids;

        if (currentCategoryName) {
            Utils.throwError(OJError.NotYetSupported, "@dynamic is not yet supported in a category's implementation", node);
        }

        for (var i = 0, length = ids.length; i < length; i++) {
            var name = ids[i].name;
            currentClass.makePropertyDynamic(name);
        }
    }

    function handleOJTypedefDeclaration(node)
    {
        model.aliasType(node.from, node.to);
    }

    function handleOJEnumDeclaration(node)
    {
        var length = node.declarations ? node.declarations.length : 0;
        var last = node;

        // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger
        function isInteger(nVal) {
            return typeof nVal === "number" && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
        }

        function valueForInit(initNode) {
            var literalNode;
            var negative = false;

            if (initNode.type == Syntax.UnaryExpression) {
                literalNode = initNode.argument;
                negative = true;
            } else if (initNode.type == Syntax.Literal) {
                literalNode = initNode;
            }

            if (!literalNode || (literalNode.type != Syntax.Literal)) {
                Utils.throwError(OJError.NonLiteralEnum, "Use of non-literal value with @enum", literalNode || initNode);
            }

            var value = literalNode.value;
            if (!isInteger(value)) {
                Utils.throwError(OJError.NonIntegerEnum, "Use of non-integer value with @enum", literalNode || initNode);
            }

            return negative ? -value : value;
        }

        var name = node.id ? node.id.name : null;
        var e = new Model.OJEnum(name, node.unsigned);

        if (length) {
            var firstDeclaration = node.declarations[0];
            var lastDeclaration  = node.declarations[length - 1];
            var currentValue = 0;
            var declaration, i;

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

    function handleOJConstDeclaration(node)
    {
        var length = node.declarations ? node.declarations.length : 0;
        var values = [ ];

        for (var i = 0; i < length; i++) {
            var declaration = node.declarations[i];

            if (declaration.init.type === Syntax.Literal) {
                var raw = declaration.init.raw;

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

        for (var i = 0; i < length; i++) {
            var declaration = node.declarations[i];
            var ojConst = new Model.OJConst(declaration.id.name, values[i]);
            model.addConst(ojConst);
        }
    }

    function handleOJGlobalDeclaration(inNode)
    {
        function addGlobalWithNode(node) {
            var name = node.id.name;
            var annotation;

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
            for (var i = 0, length = node.params.length; i < length; i++) {
                var param = node.params[i];

                if (param.name == "self") {
                    Utils.throwError(OJError.SelfIsReserved, "Use of self as function parameter name", node);
                }
            }
        }
    }

    traverser.traverse(function(node, parent) {
        var type = node.type;

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
                handleOJEnumDeclaration(node);

            } else if (type === Syntax.OJConstDeclaration) {
                handleOJConstDeclaration(node);

            } else if (type === Syntax.OJGlobalDeclaration) {
                handleOJGlobalDeclaration(node);

            } else if (type === Syntax.VariableDeclarator) {
                handleVariableDeclarator(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                handleFunctionDeclarationOrExpression(node);
            }

        } catch (e) {
            Utils.addNodeToError(node, e);
            throw e;
        }

    }, function(node, parent) {
        var type = node.type;

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

    model.prepare();
}


module.exports = Builder;
