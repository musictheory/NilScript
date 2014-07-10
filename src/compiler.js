/*
    compiler.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require("esprima-oj");
var Modifier   = require("./modifier").Modifier;
var Squeezer   = require("./squeezer").Squeezer;
var OJError    = require("./errors").OJError;
var Traverser  = require("./traverser").Traverser;
var Hinter     = require("./hinter").Hinter;
var Utils      = require("./utils");
var SourceNode = require("source-map").SourceNode;
var OJClass    = require("./model").OJClass;
var OJProtocol = require("./model").OJProtocol;
var Syntax     = esprima.Syntax;


var OJGlobalVariable          = "$oj_oj";

var OJClassPrefix             = "$oj_c_";
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";
var OJClassMethodsVariable    = "$oj_s";
var OJInstanceMethodsVariable = "$oj_m";
var OJTemporaryReturnVariable = "$oj_r";
var OJSuperVariable           = "$oj_super";


function errorForEsprimaError(inError)
{
    var line = inError.lineNumber;

    var message = inError.description;
    message = message.replace(/$.*Line:/, "");

    var outError = new Error(message);

    outError.line   = line;
    outError.column = inError.column;
    outError.name   = OJError.ParseError;
    outError.reason = message;

    return outError;
}


function OJCompiler(options)
{
    options = options || { };

    var state    = options.state    || { };
    var files    = options.files    || [ ];
    var contents = options.contents || options.content || [ ];

    var parserOptions   = { loc: true }
    var modifierOptions = { };

    if (options["prepend"]) {
        var prependLines = options["prepend"];

        if (typeof prependLines == "string") {
            prependLines = prependLines.split("\n")
        }

        modifierOptions["prepend"] = prependLines;
    }

    if (options["append"]) {
        var appendLines = options["append"];

        if (typeof appendLines == "string") {
            appendLines = appendLines.split("\n")
        }

        modifierOptions["append"] = appendLines;
    }

    if (options["source-map-file"]) {
        modifierOptions.sourceMapFile = options["source-map-file"];
    }

    if (options["source-map-root"]) {
        modifierOptions.sourceMapRoot = options["source-map-root"];
    }

    if (options["dump-modifier"]) {
        modifierOptions.debug = true;
    }

    this._inlines        = state["inlines"]   || { };
    this._knownSelectors = state["selectors"] || { };

    var additionalInlines = options["additional-inlines"];
    if (additionalInlines) {
        for (var key in additionalInlines) {
            if (additionalInlines.hasOwnProperty(key)) {
                this._inlines[key] = JSON.stringify(additionalInlines[key]);
            }
        }
    }

    if (options["squeeze"]) {
        var start = options["squeeze-start-index"] || 0;
        var max   = options["squeeze-end-index"]   || 0;

        this._squeezer = new Squeezer(state["squeeze"], {
            start: start,
            max:   max
        });
    }

    var lineCounts = [ ];
    var allLines   = [ ];

    for (var i = 0, length = contents.length; i < length; i++) {
        var lines = contents[i].split("\n");
        lineCounts.push(lines.length);
        Array.prototype.push.apply(allLines, lines);
    }


    this._inputFiles         = files;
    this._inputLines         = allLines;
    this._inputLineCounts    = lineCounts;
    this._inputParserOptions = parserOptions;

    this._modifier  = new Modifier(files, lineCounts, allLines, modifierOptions);

    this._options   = options;
    this._classes   = { };
    this._protocols = { };
    this._ast       = null;
}



OJCompiler.prototype.getClassName = function(className)
{
    if (!className) return;

    if (!Utils.isBaseObjectClass(className)) {
        if (this._squeezer) {
            return this._squeezer.squeeze(OJClassPrefix + className);
        } else {
            return OJClassPrefix + className;
        }
    }

    return className;
}


OJCompiler.prototype.getMethodName = function(selectorName)
{
    var replacedName = selectorName;
    replacedName = replacedName.replace(/_/g,   "__");
    replacedName = replacedName.replace(/^__/g, "_");
    replacedName = replacedName.replace(/\:/g,  "_");

    if (!Utils.isBaseObjectSelectorName(selectorName)) {
        if (this._squeezer) {
            return this._squeezer.squeeze(OJMethodPrefix + replacedName);
        } else {
            return OJMethodPrefix + replacedName;
        }
    }

    return replacedName;
}


OJCompiler.prototype._firstPass = function()
{
    var compiler  = this;
    var classes   = this._classes;
    var protocols = this._protocols;
    var inlines   = this._inlines;
    var options   = this._options;
    var squeezer  = this._squeezer;
    var currentClass, currentMethodNode, functionInMethodCount = 0;
    var currentProtocol;

    var traverser = new Traverser(this._ast);

    function registerClass(name, superclassName, overrideExisting) {
        var result;

        if (!classes[name] || overrideExisting) {
            classes[name] = result = new OJClass(name, superclassName);
        }

        return result;
    }

    function registerProtocol(name) {
        var result;

        if (!protocols[name]) {
            protocols[name] = result = new OJProtocol(name);
        }

        return result;
    }

    function registerSqueeze(name) {
        if (squeezer) {
            squeezer.squeeze(name, true);
        }
    }

    function registerEnum(node)
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
                Utils.throwError(literalNode || initNode, OJError.NonLiteralEnum, "Use of non-literal value with @enum");
            }

            var value = literalNode.value;
            if (!isInteger(value)) {
                Utils.throwError(literalNode || initNode, OJError.NonIntegerEnum, "Use of non-integer value with @enum");
            }

            return negative ? -value : value;
        }

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

                if (options["inline-enum"]) {
                    inlines[declaration.id.name] = currentValue;
                }

                declaration.enumValue = currentValue;

                currentValue++;
            }
        }
    }

    function registerConst(node)
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
                Utils.throwError(node, OJError.NonLiteralConst, "Use of non-literal value with @const");
            }
        }

        if (options["inline-const"]) {
            for (var i = 0; i < length; i++) {
                var declaration = node.declarations[i];
                inlines[declaration.id.name] = values[i];
            }
        }
    }

    traverser.traverse(function(node, type) {
        if (type === Syntax.OJClassImplementation) {
            currentClass = registerClass(node.id.name, node.superClass && node.superClass.value, true);

            if (node.superClass && node.superClass.value) {
                registerClass(node.superClass.value);
            }

        } else if (type === Syntax.OJProtocolDefinition) {
            currentProtocol = registerProtocol(node.id.name);

        } else if (type === Syntax.OJAtClassDirective) {
            node.ids.forEach(function(id) {
                registerClass(id.name);
            });

        } else if (type === Syntax.OJAtSqueezeDirective) {
            node.ids.forEach(function(id) {
                registerSqueeze(id.name);
            });

        } else if (type === Syntax.OJInstanceVariableDeclaration) {
            currentClass.registerIvarDeclaration(node);

        } else if (type === Syntax.OJAtPropertyDirective) {
            currentClass.registerAtProperty(node);

        } else if (type === Syntax.OJAtSynthesizeDirective) {
            currentClass.registerAtSynthesize(node);

        } else if (type === Syntax.OJAtDynamicDirective) {
            currentClass.registerAtDynamic(node);

        } else if (type === Syntax.OJMethodDefinition) {
            currentClass.registerMethodDefinition(node);
            currentMethodNode = node;

        } else if (type === Syntax.OJMethodDeclaration) {
            currentProtocol.registerMethodDeclaration(node);

        // Check for self = expression (for initializers)
        } else if (type == Syntax.AssignmentExpression) {
            if (currentMethodNode &&
                node.left &&
                node.left.type == Syntax.Identifier &&
                node.left.name == "self")
            {
                currentMethodNode.usesSelfVar = true;
            }

        } else if (type === Syntax.FunctionDeclaration ||
                   type === Syntax.FunctionExpression)
        {
            if (currentMethodNode) {
                currentMethodNode.usesSelfVar = true;
            }

        } else if (type === Syntax.OJEnumDeclaration) {
            registerEnum(node);

        } else if (type === Syntax.OJConstDeclaration) {
            registerConst(node);
        }

    }, function(node, type) {
        if (type === Syntax.OJClassImplementation) {
            currentClass = null;
            currentMethodNode = null;

        } else if (type == Syntax.OJProtocolDefinition) {
            currentProtocol = null;

        } else if (type == Syntax.OJMethodDefinition) {
            currentMethodNode = null;
        }
    });
}



OJCompiler.prototype._prepareForSecondPass = function()
{
    var i, length, methods;

    for (var className in this._classes) { if (this._classes.hasOwnProperty(className)) {
        var cls = this._classes[className];
        cls.doAutomaticSynthesis();

        methods = cls.getInstanceMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            this._knownSelectors[methods[i].selectorName] = true;
        }

        methods = cls.getClassMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            this._knownSelectors[methods[i].selectorName] = true;
        }
    }}

    for (var protocolName in this._protocols) { if (this._protocols.hasOwnProperty(protocolName)) {
        var protocol = this._protocols[protocolName];

        methods = protocol.getInstanceMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            this._knownSelectors[methods[i].selectorName] = true;
        }

        methods = protocol.getClassMethods();
        for (i = 0, length = methods.length; i < length; i++) {
            this._knownSelectors[methods[i].selectorName] = true;
        }
    }}


    var baseObjectSelectors = Utils.getBaseObjectSelectorNames();
    for (i = 0, length = baseObjectSelectors.length; i < length; i++) {
        this._knownSelectors[baseObjectSelectors[i]] = true;
    }
}



OJCompiler.prototype._secondPass = function()
{
    var compiler = this;
    var options  = this._options;
    var classes  = this._classes;
    var modifier = this._modifier;
    var squeezer = this._squeezer;
    var inlines  = this._inlines;
    var methodNodes = [ ];
    var currentClass;
    var currentMethodNode;

    var optionDebugMessageSend = options["debug-message-send"];
    var optionWithoutClasses   = options["without-classes"];
    var optionCheckThis        = options["check-this"];
    var optionCheckIvars       = options["check-ivars"];

    var knownSelectors = options["check-selectors"] ? this._knownSelectors : null;

    function generate_method_declaration(where, selectorName) {
        if (Utils.isJScriptReservedWord(selectorName)) {
            // For IE8
            return where + "[\"" + compiler.getMethodName(selectorName) + "\"]";
        } else {
            return where + "." + compiler.getMethodName(selectorName);
        }
    }

    function generate_ivar(className, ivarName) {
        var result = OJIvarPrefix + className + "_" + ivarName;
        if (squeezer) result = squeezer.squeeze(result);
        return result;
    }

    function generate_this_ivar(className, ivarName, useSelf) {
        return (useSelf ? "self" : "this") + "." + generate_ivar(className, ivarName);
    }

    function generate_ivar_assignments(ojClass) {
        function isNumeric(type) {
            if (!type) return false;

            var words = type.split(/\s+/);

            for (var i = 0, length = words.length; i < length; i++) {
                var word = words[i];

                if (word == "Number" ||
                    word == "float"  ||
                    word == "double" ||
                    word == "int"    ||
                    word == "char"   ||
                    word == "short"  ||
                    word == "long")
                {
                    return true;
                }
            }

            return false;
        } 

        function isBoolean(type) {
            return type == "Boolean" ||
                   type == "BOOL"    ||
                   type == "Bool"    ||
                   type == "bool";
        }

        var booleanIvars = [ ];
        var numericIvars = [ ];
        var objectIvars  = [ ];
        var i, length, ivar;

        var ivars = ojClass.getAllIvars();

        for (i = 0, length = ivars.length; i < length; i++) {
            var ivar = ivars[i];

            if (isNumeric(ivar.type)) {
                numericIvars.push(ivar.name);
            } else if (isBoolean(ivar.type)) {
                booleanIvars.push(ivar.name);
            } else {
                objectIvars.push(ivar.name);
            }
        }

        numericIvars.sort();
        booleanIvars.sort();
        objectIvars.sort();

        var result = "";

        if (objectIvars.length) {
            for (i = 0, length = objectIvars.length; i < length; i++) {
                result += "this." + generate_ivar(ojClass.name, objectIvars[i]) + "="
            }

            result += "null;"
        }

        if (numericIvars.length) {
            for (i = 0, length = numericIvars.length; i < length; i++) {
                result += "this." + generate_ivar(ojClass.name, numericIvars[i]) + "="
            }

            result += "0;"
        }

        if (booleanIvars.length) {
            for (i = 0, length = booleanIvars.length; i < length; i++) {
                result += "this." + generate_ivar(ojClass.name, booleanIvars[i]) + "="
            }

            result += "false;"
        }

        return result;
    }


    function should_remove_class(cls)
    {
        var original = cls.name;

        if (optionWithoutClasses) { 
            do {
                if (optionWithoutClasses.indexOf(cls.name) >= 0) {
                    return true;
                }

                if (cls.superclassName) {
                    cls = classes[cls.superclassName];
                } else {
                    cls = null;
                }

            } while (cls && cls.name);
        }

        return false;
    }


    function getSelectorForMethodName(methodName)
    {
        if (Utils.isJScriptReservedWord(methodName)) {
            return "{ \"" + methodName + "\": " + "1 }";
        } else {
            return "{ " + methodName + ": " + "1 }";
        }
    }


    function can_be_instance_variable_or_self(path)
    {
        var idNode, parentNode;

        for (var i = path.length - 1; i >= 0; i--) {
            var node = path[i];

            if (node.type) {
                if (!idNode) {
                    idNode = node;

                } else if (!parentNode) {
                    parentNode = node;
                    break;
                }
            }
        }

        if (parentNode.type == Syntax.MemberExpression && !parentNode.computed) {
            return parentNode.object == idNode;
        }

        return true;   
    }

    function handle_message_expression(node)
    {
        var receiver     = node.receiver.value;
        var methodName   = compiler.getMethodName(node.selectorName);
        var reserved     = Utils.isJScriptReservedWord(methodName);
        var hasArguments = false;

        var firstSelector, lastSelector;

        if (knownSelectors && !knownSelectors[node.selectorName]) {
            Utils.throwError(node, OJError.UnknownSelector, "Use of unknown selector '" + node.selectorName + "'");
        }

        for (var i = 0, length = node.messageSelectors.length; i < length; i++) {
            var messageSelector = node.messageSelectors[i];

            if (messageSelector.arguments || messageSelector.argument) {
                hasArguments = true;
            }
        }

        function replaceMessageSelectors()
        {
            for (var i = 0, length = node.messageSelectors.length; i < length; i++) {
                var messageSelector = node.messageSelectors[i];

                if (!firstSelector) {
                    firstSelector = messageSelector;
                }

                if (messageSelector.arguments) {
                    var lastArgument = messageSelector.arguments[messageSelector.arguments.length - 1];

                    modifier.from(messageSelector).to(messageSelector.arguments[0]).replace("[");
                    modifier.after(lastArgument).insert("]");

                    lastSelector = lastArgument;

                } else if (messageSelector.argument) {
                    modifier.from(messageSelector).to(messageSelector.argument).remove();
                    lastSelector = messageSelector.argument;

                    if (i < (length - 1)) {
                        var nextSelector = node.messageSelectors[i+1];
                        modifier.from(messageSelector.argument).to(nextSelector).replace(",");
                    }

                } else {
                    modifier.select(messageSelector).remove()
                    lastSelector = messageSelector;
                    messageSelector.skip = true;
                }
            }        
        }

        function doCommonReplacement(start, end) {
            replaceMessageSelectors();

            node.receiver.skip = true;
            modifier.from(node).to(firstSelector).replace(start);
            modifier.from(lastSelector).to(node).replace(end);
        }

        // Optimization cases
        if (!optionDebugMessageSend) {
            if (receiver.type == Syntax.Identifier && currentMethodNode && !reserved) {
                var selfOrThis = (currentMethodNode && currentMethodNode.usesSelfVar) ? "self" : "this";
                var useProto   = (currentMethodNode.selectorType != "+");

                if (receiver.name == "super") {
                    doCommonReplacement(currentClass.name + "." + OJSuperVariable + "." + (useProto ? "prototype." : "") + methodName + ".call(this" + (hasArguments ? "," : ""), ")");
                    return;

                } else if (classes[receiver.name]) {
                    var classVariable = OJGlobalVariable + "._cls." + compiler.getClassName(receiver.name);

                    if (methodName == "alloc") {
                        node.receiver.skip = true;
                        modifier.select(node).replace("new " + classVariable + "()");
                        return;
                    }

                    doCommonReplacement(classVariable + "." + methodName + "(", ")");
                    return;

                } else if (receiver.name == "self") {
                    doCommonReplacement(selfOrThis + "." + methodName + "(", ")");
                    return;

                } else if (currentClass.isIvar(receiver.name)) {
                    var ivar = generate_this_ivar(currentClass.name, receiver.name, currentMethodNode.usesSelfVar);
    
                    currentMethodNode.usesLoneExpression = true;
                    doCommonReplacement("(" + ivar + " && " + ivar + "." + methodName + "(", "))");
    
                    return;

                } else {
                    currentMethodNode.usesLoneExpression = true;
                    doCommonReplacement("(" + receiver.name + " && " + receiver.name + "." + methodName + "(", "))");

                    return;
                }

            } else if (currentMethodNode) {
                currentMethodNode.usesTemporaryVar = true;
                currentMethodNode.usesLoneExpression = true;

                replaceMessageSelectors();

                modifier.from(node).to(receiver).replace("((" + OJTemporaryReturnVariable + " = (");

                if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
                    modifier.select(receiver).replace(OJGlobalVariable + "._cls." + compiler.getClassName(receiver.name));
                }

                modifier.from(receiver).to(firstSelector).replace(")) && " + OJTemporaryReturnVariable + "." + methodName + "(");
                modifier.from(lastSelector).to(node).replace("))");

                return;
            }
        }

        // Slow path
        replaceMessageSelectors();

        modifier.from(node).to(receiver).replace(OJGlobalVariable + "." + (optionDebugMessageSend ? "msgSend_debug" : "msgSend") + "(");

        if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
            modifier.select(receiver).replace(OJGlobalVariable + "._cls." + compiler.getClassName(receiver.name));
        }

        modifier.from(receiver).to(firstSelector).replace("," + getSelectorForMethodName(methodName) + (hasArguments ? "," : ""));
        modifier.from(lastSelector).to(node).replace(")");
    }

    function handle_class_implementation(node)
    {
        var superClass = (node.superClass && node.superClass.value);

        var superSelector = "{ " + compiler.getClassName(superClass)   + ":1 }";
        var clsSelector   = "{ " + compiler.getClassName(node.id.name) + ":1 }";

        var constructorCallSuper = "";
        if (superClass) {
            constructorCallSuper = OJGlobalVariable + "._cls." + compiler.getClassName(superClass) + ".call(this);";
        }


        var constructorSetIvars = generate_ivar_assignments(currentClass);

        var startText = "var " + node.id.name + " = " + OJGlobalVariable + "._registerClass(" +
            clsSelector + ", " +
            (superClass ? superSelector : "null") + ", " +
            "function(" + OJClassMethodsVariable + ", " + OJInstanceMethodsVariable + ") { " +
            "function " + node.id.name + "() { " +
            constructorCallSuper +
            constructorSetIvars  +
            "this.constructor = " + node.id.name + ";" +
            "this.$oj_id = ++" + OJGlobalVariable + "._id;" +
            "}";

        modifier.from(node).to(node.ivarDeclarations || node.body).replace(startText);
        modifier.from(node.body).to(node).replace("return " + node.id.name + ";});");
    }

    function handle_method_definition(node)
    {
        var methodName = compiler.getMethodName(node.selectorName);
        var isClassMethod = node.selectorType == "+";
        var where = isClassMethod ? OJClassMethodsVariable : OJInstanceMethodsVariable;
        var args = [ ];

        if (Utils.isReservedSelectorName(node.selectorName)) {
            Utils.throwError(node, OJError.ReservedMethodName, "The method name \"" + node.selectorName + "\" is reserved by the runtime and may not be overridden.");
        }

        for (var i = 0, length = node.methodSelectors.length; i < length; i++) {
            var variableName = node.methodSelectors[i].variableName;
            if (variableName) {
                args.push(variableName.name);
            }
        }

        modifier.from(node).to(node.body).replace(where + "." + methodName + " = function(" + args.join(", ") + ") ");

        if (node.usesSelfVar || node.usesTemporaryVar || node.usesLoneExpression) {
            var toInsert = "";

            var varParts = [ ];

            if (node.usesSelfVar)      varParts.push("self = this");
            if (node.usesTemporaryVar) varParts.push(OJTemporaryReturnVariable);

            if (node.usesLoneExpression) {
                toInsert += "/* jshint expr: true */";
            }

            if (varParts.length) {
                toInsert += "var " + varParts.join(",") + ";";
            }

            if (toInsert.length && node.body.body.length) {
                modifier.before(node.body.body[0]).insert(toInsert);
            }
        }

        modifier.from(node.body).to(node).remove();
    }

    function handle_literal(node)
    {
        var replacement;

        if (node.value === null) {
            replacement = "null";
        } else if (node.value === true) {
            replacement = "true";
        } else if (node.value === false) {
            replacement = "false";
        }

        if (replacement) {
            modifier.select(node).replace(replacement);
        }
    }

    function handle_identifier(node)
    {
        var name = node.name;

        if (name.indexOf("$oj") == 0) {
            if (name[3] == "$" || name[3] == "_") {
                Utils.throwError(node, OJError.DollarOJIsReserved, "Identifiers may not start with \"$oj_\" or \"$oj$\"");
            }
        }

        if (currentMethodNode && currentClass && can_be_instance_variable_or_self(traverser.getPath())) {
            if (currentClass.isIvar(name) || name == "self") {
                var usesSelf = currentMethodNode && currentMethodNode.usesSelfVar;
                var replacement;

                if (name == "self") {
                    replacement = usesSelf ? "self" : "this";
                } else {
                    replacement = generate_this_ivar(currentClass.name, name, usesSelf);
                }

                modifier.select(node).replace(replacement);

            } else {
                if (name[0] == "_" && optionCheckIvars && (name.length > 1)) {
                    Utils.throwError(node, OJError.UndeclaredInstanceVariable, "Use of undeclared instance variable " + node.name);
                }
            } 
        }

        if (inlines) {
            var result = inlines[name];
            if (result !== undefined) {
                if (inlines.hasOwnProperty(name)) {
                    modifier.select(node).replace("" + result);
                }
            }
        }

        if (squeezer) {
            var result = squeezer.lookup(name);
            if (result !== undefined) {
                modifier.select(node).replace("" + result);
            }
        }
    }

    function handle_at_property(node)
    {
        var name = node.id.name;

        var makeGetter = currentClass.shouldGenerateGetterImplementationForPropertyName(name);
        var makeSetter = currentClass.shouldGenerateSetterImplementationForPropertyName(name);
        var property   = currentClass.getPropertyWithName(name);

        var result = "";
        if (makeSetter) {
            result += generate_method_declaration(OJInstanceMethodsVariable, property.setter);
            result += " = function(arg) { " + generate_this_ivar(currentClass.name, property.ivar, false) + " = arg; } ; ";
        }

        if (makeGetter) {
            result += generate_method_declaration(OJInstanceMethodsVariable, property.getter);
            result += " = function() { return " + generate_this_ivar(currentClass.name, property.ivar, false) + "; } ; ";
        }

        modifier.select(node).replace(result);

        node.skip = true;
    }

    function handle_at_selector(node)
    {
        var name = compiler.getMethodName(node.name);

        if (knownSelectors && !knownSelectors[node.name]) {
            Utils.throwError(node, OJError.UnknownSelector, "Use of unknown selector '" + node.name + "'");
        }

        modifier.select(node).replace("{ " + name + ": 1 }");
    }

    function handle_enum_declaration(node)
    {
        var length = node.declarations ? node.declarations.length : 0;
        var last   = node;

        if (length) {
            var firstDeclaration = node.declarations[0];
            var lastDeclaration  = node.declarations[length - 1];
            var declaration, i;

            for (i = 0; i < length; i++) {
                declaration = node.declarations[i];

                if (!declaration.init) {
                    modifier.after(declaration.id).insert("=" + declaration.enumValue);
                }

                if (last == node) {
                    modifier.before(declaration.id).insert("var ");
                    modifier.from(last).to(declaration.id).remove();

                } else {
                    modifier.after(last).insert("; ");
                    modifier.from(last).to(declaration.id).insert("var ");
                }

                last = declaration;
            }

            modifier.after(lastDeclaration).insert(";");
            modifier.from(lastDeclaration).to(node).replace("");

        } else {
            modifier.select(node).remove();
        }
    }

    function handle_const_declaration(node)
    {
        var length = node.declarations ? node.declarations.length : 0;
        var values = [ ];

        if (length) {
            var firstDeclaration = node.declarations[0];
            modifier.from(node).to(firstDeclaration.id).replace("var ");

        } else {
            modifier.select(node).remove();
        }
    }

    function check_this(thisNode, path)
    {
        var inFunction = false;
        var inMethod   = true;

        for (var i = path.length - 1; i >= 0; i--) {
            var node = path[i];

            if (node.type == Syntax.OJMethodDefinition ||
                node.type == Syntax.OJClassImplementation ||
                node.type == Syntax.OJMessageExpression)
            {
                Utils.throwError(thisNode, OJError.UseOfThisInMethod, "Use of 'this' keyword in oj method definition");

            } else if (node.type == Syntax.FunctionDeclaration ||
                       node.type == Syntax.FunctionExpression) {
                break;
            }
        }
    }

    function finalize_method_nodes()
    {
        for (var i = 0, length = methodNodes.length; i < length; i++) {
            handle_method_definition(methodNodes[i]);
        }
    }

    var traverser = new Traverser(this._ast);

    traverser.traverse(function(node, type) {
        if (type === Syntax.OJMessageExpression) {
            handle_message_expression(node);

        } else if (type === Syntax.OJClassImplementation) {
            currentClass = classes[node.id.name];

            if (optionWithoutClasses && should_remove_class(currentClass)) {
                modifier.select(node).remove();
                return Traverser.SkipNode;

            } else {
                handle_class_implementation(node);
            }

        } else if (type === Syntax.OJProtocolDefinition) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJAtClassDirective) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJAtSqueezeDirective) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJInstanceVariableDeclarations) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJMethodDefinition) {
            currentMethodNode = node;
            methodNodes.push(node);

        } else if (type === Syntax.OJAtPropertyDirective) {
            handle_at_property(node);

        } else if (type === Syntax.OJAtSynthesizeDirective || node.type == Syntax.OJAtDynamicDirective) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJAtSelectorDirective) {
            handle_at_selector(node);

        } else if (type === Syntax.OJEnumDeclaration) {
            if (options["inline-enum"]) {
                modifier.select(node).remove();
                return Traverser.SkipNode;
            } else {
                handle_enum_declaration(node);
            }

        } else if (type === Syntax.OJConstDeclaration) {
            if (options["inline-const"]) {
                modifier.select(node).remove();
                return Traverser.SkipNode;
            } else {
                handle_const_declaration(node);
            }

        } else if (type === Syntax.Literal) {
            handle_literal(node);

        } else if (type === Syntax.Identifier) {
            handle_identifier(node);

        } else if (type === Syntax.ThisExpression) {
            if (optionCheckThis) {
                check_this(node, traverser.getPath());
            }
        }

    }, function(node, type) {
        if (type === Syntax.OJClassImplementation) {
            currentClass = null;
        } else if (type === Syntax.OJMethodDefinition) {
            currentMethodNode = null;
        }
    });

    finalize_method_nodes();
}


OJCompiler.prototype._getFileAndLineForLine = function(inLine)
{
    var files      = this._inputFiles;
    var lineCounts = this._inputLineCounts;

    var startLineForFile = 0; 
    var endLineForFile   = 0;

    for (var i = 0, length = files.length; i < length; i++) {
        var lineCount = lineCounts[i] || 0;
        endLineForFile = startLineForFile + lineCount;

        if (inLine >= startLineForFile && inLine < endLineForFile) {
            return [ files[i], inLine - startLineForFile ];
        }

        startLineForFile += lineCount;
    }

    return null;
}


OJCompiler.prototype.compile = function(callback)
{
    try {
        var dumpTime = this._options["dump-time"];
        var start;
        var result;
        var linesForHinter;

        // Parse to AST
        try { 
            start = process.hrtime();

            this._ast = esprima.parse(this._inputLines.join("\n"), this._inputParserOptions);

            if (dumpTime) {
                console.error(" Parse: ", Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
            }

        } catch (e) {
            throw errorForEsprimaError(e);
        }

        // Do first pass
        {
            start = process.hrtime();

            this._firstPass();

            this._prepareForSecondPass();

            if (dumpTime) {
                console.error("Pass 1: ", Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
            }
        }

        // Do second pass
        {
            start = process.hrtime();

            this._secondPass();

            if (dumpTime) {
                console.error("Pass 2: ", Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
            }
        }

        // Run Modifier
        {
            start = process.hrtime();

            result = this._modifier.finish();

            if (this._options["dump-time"]) {
                console.error("Finish: ", Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
            }
        }

        // Add state to result
        {
            result.state = { };

            if (this._squeezer) {
                result.state["squeeze"] = this._squeezer.getState();
            }

            result.state["inlines"]   = this._inlines;
            result.state["selectors"] = this._knownSelectors;

            linesForHinter = result._lines;
            delete(result._lines);
        }


        if (this._options["dump-ast"]) {
            result.ast = JSON.stringify(this._ast, function(key, value) {
                if (key == "parent") {
                    return undefined;
                }
                return value;
            }, 4)
        }

        if (this._options["jshint"]) {
            var config = this._options["jshint-config"];
            var ignore = this._options["jshint-ignore"];

            var hinter = new Hinter(result.code, config, ignore, linesForHinter, this._inputFiles);

            hinter.run(function(err, hints) {
                result.hints = hints;
                callback(err, result);
            });

        } else {
            callback(null, result);
        }

    } catch (e) {
        if (e.name.indexOf("OJ") !== 0) {
            console.error("Internal oj error!")
            console.error("------------------------------------------------------------")
            console.error(e);
            console.error(e.stack);
            console.error("------------------------------------------------------------")
        }

        if (e.line && !e.file) {
            var fileAndLine = this._getFileAndLineForLine(e.line);

            if (fileAndLine) {
                e.file = fileAndLine[0];
                e.line = fileAndLine[1];
            }
        }

        callback(e, null);
    }
}


module.exports = { OJCompiler: OJCompiler };
