/*
    builder.js
    Scans AST and builds internal model
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require("esprima-oj");
var Syntax     = esprima.Syntax;

var Modifier   = require("./modifier");
var OJError    = require("./errors").OJError;
var Traverser  = require("./traverser");
var Utils      = require("./utils");
var Model      = require("./model");


function Builder(ast, model)
{
    this._ast   = ast;
    this._model = model
}


function sMakeOJMethodForNode(node)
{
    var selectorName    = node.selectorName;
    var selectorType    = node.selectorType;
    var methodSelectors = node.methodSelectors;

    var variableNames  = [ ];
    var parameterTypes = [ ];

    var methodType;
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

    return new Model.OJMethod(selectorName, selectorType, returnType, parameterTypes, variableNames);
}


Builder.prototype.build = function()
{
    var compiler  = this;
    var model     = this._model;
    var currentClass, currentMethod;
    var currentProtocol;

    var traverser = new Traverser(this._ast);

    function handleClassImplementation(node)
    {
        var name           = node.id.name;
        var superclassName = node.superClass && node.superClass.value;
        var result;

        var cls = new Model.OJClass(name, superclassName);
        cls.forward = false;
        model.addClass(cls);

        if (superclassName) {
            var superclass = new Model.OJClass(superclassName);
            superclass.forward = true;
            model.addClass(superclass);
        }

        currentClass = cls;
    }

    function handleProtocolDefinition(node)
    {
        var protocol = new Model.OJProtocol(node.id.name);
        model.addProtocol(protocol);
        currentProtocol =  protocol;
    }

    function handleAtClassDirective(node)
    {
        var ids = node.ids;
        var i, length;

        for (var i = 0, length = ids.length; i < length; i++) {
            var cls = new Model.OJClass(ids[i].name);
            cls.forward = true;

            model.addClass(cls);
        }
    }
 
    function handleAtSqueezeDirective(node)
    {
        node.ids.forEach(function(id) {
            model.getSqueezedName(id.name, true);
        });
    }

    function handleMethodDefinition(node)
    {
        var method = sMakeOJMethodForNode(node);
        currentClass.addMethod(method);
        currentMethod = method;
    }

    function handleMethodDeclaration(node)
    {
        var method = sMakeOJMethodForNode(node);
        currentProtocol.addMethod(method);
    }

    function handleInstanceVariableDeclaration(node)
    {
        var type = node.parameterType ? node.parameterType.value : null;

        for (var i = 0, length = node.ivars.length; i < length; i++) {
            var name = node.ivars[i].name;
            currentClass.addIvar(new Model.OJIvar(name, currentClass.name, type));
        }
    }

    function handleAtPropertyDirective(node)
    {
        var name = node.id.name;

        var type     = node.parameterType ? node.parameterType.value : "id";
        var writable = true;
        var getter   = name;
        var setter   = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + ":";

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

    function handleAtSynthesizeDirective(node) {
        var pairs = node.pairs;

        for (var i = 0, length = pairs.length; i < length; i++) {
            var pair    = pairs[i];
            var name    = pair.id.name;
            var backing = pair.backing ? pair.backing.name : name;

            currentClass.makePropertySynthesized(name, backing);
        }        
    }

    function handleAtDynamicDirective(node) {
        var ids = node.ids;

        for (var i = 0, length = ids.length; i < length; i++) {
            var name = ids[i].name;
            currentClass.makePropertyDynamic(name);
        }
    }

    function handleEnumDeclaration(node)
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

    function handleConstDeclaration(node)
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
            model.addConst(declaration.id.name, values[i]);
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
                if (node.params[i].name) {
                    Utils.throwError(OJError.SelfIsReserved, "Use of self as function parameter name", node);
                }
            }
        }
    }

    traverser.traverse(function(node, type) {
        try {
            if (type === Syntax.OJClassImplementation) {
                handleClassImplementation(node);

            } else if (type === Syntax.OJProtocolDefinition) {
                handleProtocolDefinition(node);

            } else if (type === Syntax.OJAtClassDirective) {
                handleAtClassDirective(node);

            } else if (type === Syntax.OJAtSqueezeDirective) {
                handleAtSqueezeDirective(node);

            } else if (type === Syntax.OJInstanceVariableDeclaration) {
                handleInstanceVariableDeclaration(node);

            } else if (type === Syntax.OJAtPropertyDirective) {
                handleAtPropertyDirective(node);

            } else if (type === Syntax.OJAtSynthesizeDirective) {
                handleAtSynthesizeDirective(node);

            } else if (type === Syntax.OJAtDynamicDirective) {
                handleAtDynamicDirective(node);

            } else if (type === Syntax.OJMethodDefinition) {
                handleMethodDefinition(node);

            } else if (type === Syntax.OJMethodDeclaration) {
                handleMethodDeclaration(node);

            } else if (type === Syntax.OJEnumDeclaration) {
                handleEnumDeclaration(node);

            } else if (type === Syntax.OJConstDeclaration) {
                handleConstDeclaration(node);

            } else if (type === Syntax.VariableDeclarator) {
                handleVariableDeclarator(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                handleFunctionDeclarationOrExpression(node);
            }

        } catch (e) {
            Utils.addNodeToError(node, e);
            throw e;
        }

    }, function(node, type) {
        if (type === Syntax.OJClassImplementation) {
            currentClass  = null;
            currentMethod = null;

        } else if (type == Syntax.OJProtocolDefinition) {
            currentProtocol = null;

        } else if (type == Syntax.OJMethodDefinition) {
            currentMethod = null;
        }
    });

    model.prepare();
}


module.exports = Builder;
