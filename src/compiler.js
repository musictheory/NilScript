/*
    compiler.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require && require("esprima-oj");
var Modifier   = require && require("./modifier").Modifier;
var Squeezer   = require && require("./squeezer").Squeezer;
var OJError    = require && require("./errors").OJError;
var Traverser  = require && require("./traverser").Traverser;
var Hinter     = require && require("./hinter").Hinter;
var Utils      = require && require("./utils");
var SourceNode = require && require("source-map").SourceNode;
var Syntax     = esprima.Syntax;


var OJGlobalVariable          = "$oj_oj";

var OJClassPrefix             = "$oj_c_";
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";
var OJClassMethodsVariable    = "$oj_s";
var OJInstanceMethodsVariable = "$oj_m";
var OJTemporaryReturnVariable = "$oj_r";
var OJSuperVariable           = "$oj_super";


function throwError(node, name, message)
{
    var line  = node.loc.start.line;
    var error = new Error(message);

    error.line    = line;
    error.column  = node.loc.start.col;
    error.name    = name;
    error.reason  = message;

    throw error;
}


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


var OJClass = (function () {

var OJDynamicProperty     = " OJDynamicProperty ";
var OJIvarWithoutProperty = " OJIvarWithoutProperty ";

function OJClass(name, superclassName, compiler)
{
    this.name = name;
    this.superclassName = superclassName;

    this._compiler = compiler;

    this._atPropertyNodes   = { };
    this._propertyToIvarMap = { };
    this._ivarToPropertyMap = { };
    this._ivarToTypeMap     = { };
    this._instanceMethods   = { };
    this._classMethods      = { };

    this._jsNameToInstanceMethodMap = { };
    this._jsNameToClassMethodMap    = { };
}


OJClass.prototype.registerIvarDeclaration = function(node)
{
    for (var i = 0, length = node.ivars.length; i < length; i++) {
        var name = node.ivars[i].name;
        this._ivarToPropertyMap[name] = OJIvarWithoutProperty;
        this._ivarToTypeMap[name] = node.parameterType ? node.parameterType.value : null;
    }
}


OJClass.prototype.registerAtProperty = function(node)
{
    var name = node.id.name;

    if (this._atPropertyNodes[name]) {
        throwError(node, OJError.DuplicatePropertyDefinition, "Property " + node.id.name + " has previous declaration");
    }

    this._atPropertyNodes[name] = node;
}


OJClass.prototype.registerAtSynthesize = function(node)
{
    var pairs = node.pairs;

    for (var i = 0, length = pairs.length; i < length; i++) {
        var pair = pairs[i];
        var name = pair.id.name;
        var backing = pair.backing ? pair.backing.name : name;

        this.linkPropertyToInstanceVariable(name, backing, node);
    }
}

OJClass.prototype.registerAtDynamic = function(node)
{
    var ids = node.ids;

    for (var i = 0, length = ids.length; i < length; i++) {
        var id = ids[i];
        var property = id.name;

        this.linkPropertyToInstanceVariable(property, OJDynamicProperty, node);
    }
}


OJClass.prototype.registerMethodDefinition = function(node)
{
    var name  = node.selectorName;
    var map   = (node.selectorType == "+") ? this._classMethods : this._instanceMethods;

    if (map[name]) {
        throwError(node, OJError.DuplicateMethodDefinition, "Duplicate declaration of method '" + name + "'");
    }
    map[name] = node;

    var jsName = this._compiler.getMethodName(name);
    var jsMap  = (node.selectorType == "+") ? this._jsNameToClassMethodMap : this._jsNameToInstanceMethodMap;

    if ((existing = jsMap[jsName])) {
        throwError(node, OJError.DuplicateJavascriptFunction, "Both '" + existing.selectorName + "' and '" + name + "' map to JavaScript function '" + jsName + "'");
    }
    jsMap[jsName] = node;
}


OJClass.prototype.linkPropertyToInstanceVariable = function(property, ivar, node)
{
    var existingIvar     = this._propertyToIvarMap[property];
    var existingProperty = this._ivarToPropertyMap[ivar];

    if (existingIvar) {
        if (existingIvar == OJDynamicProperty) {
            throwError(node, OJError.PropertyAlreadyDynamic, "Property " + property + " already declared dynamic");
        } else {
            throwError(node, OJError.PropertyAlreadySynthesized, "Property " + property + " already synthesized to " + existingIvar);
        }
    }

    if (existingProperty && (existingProperty != OJIvarWithoutProperty) && (ivar != OJDynamicProperty)) {
        throwError(node, OJError.InstanceVariableAlreadyClaimed, "Both '" + property + "' and '" + existingProperty + "' claim instance variable '" + ivar);
    }

    this._propertyToIvarMap[property] = ivar;
    this._ivarToPropertyMap[ivar] = property;

    var atPropertyNode = this._atPropertyNodes[property];
    var type = atPropertyNode.parameterType ? atPropertyNode.parameterType.value : null;
    this._ivarToTypeMap[ivar] = type;
}


OJClass.prototype.doDefaultSynthesis = function()
{
    var atPropertyNodes   = this._atPropertyNodes;
    var propertyToIvarMap = this._propertyToIvarMap;

    for (var propertyName in this._atPropertyNodes) { if (this._atPropertyNodes.hasOwnProperty(propertyName)) {
        var node = this._atPropertyNodes[propertyName];

        if (!propertyToIvarMap[propertyName]) {
            this.linkPropertyToInstanceVariable(propertyName, "_" + propertyName, node);
        }
    }}
}


OJClass.prototype.isInstanceVariable = function(ivar)
{
    return !!this._ivarToPropertyMap[ivar];
}


OJClass.prototype.generateIvar = function(name)
{
    var squeezer = this._compiler._squeezer;
    var result   = OJIvarPrefix + this.name + "_" + name;

    if (squeezer) result = squeezer.squeeze(result);

    return result;
}


OJClass.prototype.generateThisIvar = function(name, useSelf)
{
    return (useSelf ? "self" : "this") + "." + this.generateIvar(name);
}


OJClass.prototype.generateIvarAssignments = function()
{
    // var defaultValue = "null";

    // if (parameterType == "Boolean" || parameterType == "BOOL") {
    //     defaultValue = "false";
    // } else if (parameterType == "Number") {
    //     defaultValue = "0";
    // }

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
    var i, length, ivar, type;

    for (ivar in this._ivarToPropertyMap) { if (this._ivarToPropertyMap.hasOwnProperty(ivar)) {
        if (ivar == OJDynamicProperty) {
            continue;
        }

        type = this._ivarToTypeMap[ivar];


        if (isNumeric(type)) {
            numericIvars.push(ivar);
        } else if (isBoolean(type)) {
            booleanIvars.push(ivar);
        } else {
            objectIvars.push(ivar);
        }
    }}

    numericIvars.sort();
    booleanIvars.sort();
    objectIvars.sort();

    var result = "";

    if (objectIvars.length) {
        for (i = 0, length = objectIvars.length; i < length; i++) {
            result += "this." + this.generateIvar(objectIvars[i]) + "="
        }

        result += "null;"
    }

    if (numericIvars.length) {
        for (i = 0, length = numericIvars.length; i < length; i++) {
            result += "this." + this.generateIvar(numericIvars[i]) + "="
        }

        result += "0;"
    }

    if (booleanIvars.length) {
        for (i = 0, length = booleanIvars.length; i < length; i++) {
            result += "this." + this.generateIvar(booleanIvars[i]) + "="
        }

        result += "false;"
    }

    return result;
}



OJClass.prototype.generateMethodDeclaration = function(type, selector)
{
    var where = (type == "+") ? OJClassMethodsVariable : OJInstanceMethodsVariable;

    if (Utils.isJScriptReservedWord(selector)) {
        // For IE8
        return where + "[\"" + this._compiler.getMethodName(selector) + "\"]";
    } else {
        return where + "." + this._compiler.getMethodName(selector);
    }
}


OJClass.prototype.generateAccessorsForProperty = function(name)
{
    // It's dynamic, do not generate accessors
    if (this._propertyToIvarMap[name] == OJDynamicProperty) {
        return "";
    }

    var node       = this._atPropertyNodes[name];
    var getter     = name;
    var setter     = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length) + "_";
    var makeSetter = true; // Default to readwrite
    var makeGetter = true; // Default to readwrite

    for (var i = 0, length = node.attributes.length; i < length; i++) {
        var attribute = node.attributes[i];
        var attributeName = attribute.name;

        if (attributeName == "readonly") {
            makeSetter = false;
        } else if (attribute.name == "readwrite") {
            makeSetter = makeGetter = true;
        } else if (attributeName == "getter") {
            getter = attribute.selector.selectorName;
        } else if (attributeName == "setter") {
            setter = attribute.selector.selectorName;
        }
    }

    // See if the getter/setter were explicitly defined in the class
    if (this._instanceMethods[getter]) makeGetter = false;
    if (this._instanceMethods[setter]) makeSetter = false;

    var ivar = this.getIvarNameForPropertyName(name);

    var result = "";
    if (makeSetter) {
        result += this.generateMethodDeclaration('-', setter);
        result += " = function(arg) { " + this.generateThisIvar(ivar) + " = arg; } ; ";
    }

    if (makeGetter) {
        result += this.generateMethodDeclaration('-', getter);
        result += " = function() { return " + this.generateThisIvar(ivar) + "; } ; ";
    }

    return result;
}


OJClass.prototype.getIvarNameForPropertyName = function(propertyName)
{
    if (this._propertyToIvarMap[propertyName]) {
        return this._propertyToIvarMap[propertyName];
    } else {
        return "_" + propertyName;
    }
}


return OJClass; })();


var OJCompiler = (function () {


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

    this._inlines = state["inlines"] || { };

    if (options["squeeze"]) {
        var start = options["squeeze-start-index"] || 0;
        var max   = options["squeeze-max-index"]   || 0;

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
    this._traverser = null;
    this._ast       = null;
    this._traverser = null;
}



OJCompiler.prototype.getClassName = function(className)
{
    if (!className) return;

    if (!Utils.isRuntimeDefinedClass(className)) {
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
    var replacedName = selectorName.replace(/\:/g, "_");

    if (!Utils.isRuntimeDefinedMethod(replacedName)) {
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
    var compiler = this;
    var classes  = this._classes;
    var inlines  = this._inlines;
    var options  = this._options;
    var squeezer = this._squeezer;
    var currentClass, currentMethodNode, functionInMethodCount = 0;

    var traverser = new Traverser(this._ast);
    this._traverser = traverser;

    function registerClass(name, superclassName, overrideExisting) {
        var result;

        if (!classes[name] || overrideExisting) {
            classes[name] = result = new OJClass(name, superclassName, compiler);
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
                throwError(literalNode || initNode, OJError.NonLiteralEnum, "Use of non-literal value with @enum");
            }

            var value = literalNode.value;
            if (!isInteger(value)) {
                throwError(literalNode || initNode, OJError.NonIntegerEnum, "Use of non-integer value with @enum");
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
                throwError(node, OJError.NonLiteralConst, "Use of non-literal value with @const");
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

        } else if (type == Syntax.OJMethodDefinition) {
            currentMethodNode = null;
        }
    });
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

        if (!node.messageSelectors) {
            console.log(node);
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

                } else if (currentClass.isInstanceVariable(receiver.name)) {
                    var ivar = currentClass.generateThisIvar(receiver.name, currentMethodNode.usesSelfVar);
    
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

                modifier.from(node).to(receiver).replace("(" + OJTemporaryReturnVariable + " = (");

                if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
                    modifier.select(receiver).replace(OJGlobalVariable + "._cls." + compiler.getClassName(receiver.name));
                }

                modifier.from(receiver).to(firstSelector).replace(")) && " + OJTemporaryReturnVariable + "." + methodName + "(");
                modifier.from(lastSelector).to(node).replace(")");

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


        var constructorSetIvars = currentClass.generateIvarAssignments();

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
            throwError(node, OJError.ReservedMethodName, "The method name \"" + node.selectorName + "\" is reserved by the runtime and may not be overridden.");
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
                throwError(node, OJError.DollarOJIsReserved, "Identifiers may not start with \"$oj_\" or \"$oj$\"");
            }
        }

        if (currentMethodNode && currentClass && can_be_instance_variable_or_self(traverser.getPath())) {
            if (currentClass.isInstanceVariable(name) || name == "self") {
                var usesSelf = currentMethodNode && currentMethodNode.usesSelfVar;
                var replacement;

                if (name == "self") {
                    replacement = usesSelf ? "self" : "this";
                } else {
                    replacement = currentClass.generateThisIvar(node.name, usesSelf);
                }

                modifier.select(node).replace(replacement);

            } else {
                if (name[0] == "_" && optionCheckIvars && (name.length > 1)) {
                    throwError(node, OJError.UndeclaredInstanceVariable, "Use of undeclared instance variable " + node.name);
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
        var parameterType = node.parameterType.value;

        var accessors = currentClass.generateAccessorsForProperty(name);
        var ivar = currentClass.getIvarNameForPropertyName(name);

        modifier.select(node).replace(accessors);

        node.skip = true;
    }


    function handle_at_selector(node)
    {
        var name = compiler.getMethodName(node.name);
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
                throwError(thisNode, OJError.UseOfThisInMethod, "Use of 'this' keyword in oj method definition");

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
    this._traverser = traverser;

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

            for (var className in this._classes) { if (this._classes.hasOwnProperty(className)) {
                this._classes[className].doDefaultSynthesis();
            }}

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

            if (this._options["dump-ast"]) {
                result.ast = JSON.stringify(this._ast, null, 4)
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

            result.state["inlines"] = this._inlines;

            linesForHinter = result._lines;
            delete(result._lines);
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
        if (e.name.indexOf("OJ")) {
            console.log("Internal oj error!")
            console.log("------------------------------------------------------------")
            console.log(e);
            console.log(e.stack);
            console.log("------------------------------------------------------------")
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


return OJCompiler; })();

module.exports = { OJCompiler: OJCompiler };
