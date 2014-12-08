/*
    builder.js
    Scans AST and builds internal model
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require("./esprima");
var Syntax     = esprima.Syntax;

var Modifier   = require("./modifier");
var OJError    = require("./errors").OJError;
var Traverser  = require("./traverser");
var Utils      = require("./utils");
var Model      = require("./model");


function Builder(ast, model)
{
    this._ast   = ast;
    this._model = model;
    this._scope = new Model.OJScope(null, null, true);
}


function sMakeOJMethodForNode(node, scope)
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
            if (scope) scope.declareVariable(variableName.name, "param");
        }
    }

    var returnType;
    if (node.returnType) returnType = node.returnType.value;
    if (!returnType) returnType = "id";

    return new Model.OJMethod(selectorName, selectorType, returnType, parameterTypes, variableNames);
}


Builder.prototype.getScope = function()
{
    return this._scope;
}


Builder.prototype.build = function()
{
    var compiler     = this;
    var model        = this._model;
    var currentScope = model.scope;

    var currentClass, currentMethod;
    var currentProtocol;

    var traverser = new Traverser(this._ast);

    function isConstLet(str)
    {
        return str === "const" || str === "let";
    }

    function makeScope(node, hoist)
    {
        var scope = new Model.OJScope(node, currentScope, !!hoist);
        node.oj_scope = scope;
        currentScope = scope;
    }

    function handleClassImplementation(node)
    {
        var name           = node.id.name;
        var superclassName = node.superClass && node.superClass.name;
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

        makeScope(node, true);
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
        makeScope(node, true);

        var method = sMakeOJMethodForNode(node, currentScope);
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

    function handleAtTypedefDeclaration(node)
    {
        model.aliasType(node.from, node.to);
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

    function handleVariableDeclaration(node)
    {
        var kind = node.kind;

        for (var i = 0, length = node.declarations.length; i < length; i++) {
            var declaration = node.declarations[i];
            currentScope.declareVariable(declaration.id.name, kind);
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
        makeScope(node, true);

        if (currentMethod) {
            for (var i = 0, length = node.params.length; i < length; i++) {
                var param = node.params[i];

                currentScope.declareVariable(param.name, "param");

                if (param.name == "self") {
                    Utils.throwError(OJError.SelfIsReserved, "Use of self as function parameter name", node);
                }
            }
        }
    }

    function handleForOrEachStatement(node)
    {
        var type = node.type;

        if (node.init && node.init.type === Syntax.VariableDeclarator && isConstLet(node.init.kind)) {
            makeScope(node);
        } else if (node.left && node.left.type === Syntax.VariableDeclarator && isConstLet(node.left.kind)) {
            makeScope(node);
        } else if (node.type == Syntax.OJAtEachStatement) {
            makeScope(node);
        }
    }

    function handleBlockStatement(node)
    {
        var currentScopeNode = currentScope.node;
        var parentType = currentScopeNode ? currentScopeNode.type : null;

        if (parentType == Syntax.OJMethodDefinition ||
            parentType == Syntax.OJClassImplementation ||
            parentType == Syntax.FunctionDeclaration ||
            parentType == Syntax.FunctionExpression)
        {
            return;
        }

        makeScope(node);
    }

    traverser.traverse(function(node, parent) {
        var type = node.type;

        if (parent) {
            node.oj_parent = parent;
        }

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

            } else if (type === Syntax.OJAtTypedefDeclaration) {
                handleAtTypedefDeclaration(node);

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

            } else if (type === Syntax.VariableDeclaration) {
                handleVariableDeclaration(node);

            } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
                handleFunctionDeclarationOrExpression(node);

            } else if (type === Syntax.ForStatement || type === Syntax.ForInStatement || type === Syntax.OJAtEachStatement) {
                handleForOrEachStatement(node);

            } else if (type === Syntax.BlockStatement) {
                handleBlockStatement(node);
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

        } else if (type == Syntax.OJProtocolDefinition) {
            currentProtocol = null;

        } else if (type == Syntax.OJMethodDefinition) {
            currentMethod = null;
        }

        if (node.oj_scope) {
            currentScope = currentScope.parent;
        }
    });

    model.prepare();
}


module.exports = Builder;
