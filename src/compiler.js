/*
    compiler.js
    (c) 2013 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima   = require && require("esprima-oj");
var Modifier  = require && require("./modifier").Modifier;
var OJError   = require && require("./errors").OJError;
var Traverser = require && require("./traverser").Traverser;
var Utils     = require && require("./utils");
var Syntax    = esprima.Syntax;


function throwError(node, errorType, message)
{
    var line  = node.loc.start.line;
    var error = new Error("Line " + line + ": " + message);

    error.lineNumber = line;
    error.column = node.loc.start.col;
    error.description = message;
    error.errorType = errorType;

    throw error;
}


var OJClass = (function () {

var OJDynamicProperty     = " OJDynamicProperty ";
var OJIvarWithoutProperty = " OJIvarWithoutProperty ";

var OJClassPrefix             = "$oj_c_";
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";
var OJClassMethodsVariable    = "$oj_s";
var OJInstanceMethodsVariable = "$oj_m";
var OJSuperVariable           = "$oj_super";


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
    return OJIvarPrefix + this.name + "_" + name;
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
        result += " = function() { return " + this.generateThisIvar(ivar) + " } ; ";
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


function OJCompiler(src, options)
{
    var parserOptions   = { loc: true }
    var modifierOptions = { };

    this._usePrefix = false;

    if (options) {
        if (options["use-enum"]) {
            parserOptions.oj_enum  = true;
        }

        if (options["debug-modifier"]) {
            modifierOptions.debug = true;
        }

        if (options["use-prefix"]) {
            this._usePrefix = true;
        }
    }

    this._modifier  = new Modifier(src, modifierOptions);
    this._ast       = esprima.parse(src, parserOptions);
    this._options   = options || { };
    this._classes   = { };
    this._traverser = null;
}


OJCompiler.prototype.getClassName = function(className)
{
    var result = className;

    if (this._usePrefix) {
        if (!Utils.isRuntimeDefinedClass(result)) {
            result = OJClassPrefix + result;
        }
    }

    return result;
}


OJCompiler.prototype.getMethodName = function(selectorName)
{
    var result = selectorName.replace(/\:/g, "_");
    if (this._usePrefix) {
        if (!Utils.isRuntimeDefinedMethod(result)) {
            result = OJMethodPrefix + result;
        }
    }

    return result;
}


OJCompiler.prototype._firstPass = function()
{
    var compiler = this;
    var classes = this._classes;
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

    traverser.traverse(function() {
        var node = traverser.getNode();

        if (node.type === Syntax.OJClassImplementation) {
            currentClass = registerClass(node.id.name, node.superClass && node.superClass.value, true);

            if (node.superClass && node.superClass.value) {
                registerClass(node.superClass.value);
            }

        } else if (node.type === Syntax.OJAtClassDirective) {
            node.ids.forEach(function(id) {
                registerClass(id.name);
            });

        } else if (node.type === Syntax.OJInstanceVariableDeclaration) {
            currentClass.registerIvarDeclaration(node);

        } else if (node.type === Syntax.OJAtPropertyDirective) {
            currentClass.registerAtProperty(node);

        } else if (node.type === Syntax.OJAtSynthesizeDirective) {
            currentClass.registerAtSynthesize(node);

        } else if (node.type === Syntax.OJAtDynamicDirective) {
            currentClass.registerAtDynamic(node);

        } else if (node.type === Syntax.OJMethodDefinition) {
            currentClass.registerMethodDefinition(node);
            currentMethodNode = node;

        // Check for self = expression (for initializers)
        } else if (node.type == Syntax.AssignmentExpression) {
            if (currentMethodNode &&
                node.left &&
                node.left.type == Syntax.Identifier &&
                node.left.name == "self")
            {
                currentMethodNode.usesSelfVar = true;
            }

        } else if (node.type === Syntax.FunctionDeclaration ||
                   node.type === Syntax.FunctionExpression)
        {
            if (currentMethodNode) {
                currentMethodNode.usesSelfVar = true;
            }
        }

    }, function(node) {
        if (node.type === Syntax.OJClassImplementation) {
            currentClass = null;
            currentMethodNode = null;

        } else if (node.type == Syntax.OJMethodDefinition) {
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
    var methodNodes = [ ];
    var currentClass;
    var currentMethodNode;


    function should_remove_class(cls)
    {
        var original = cls.name;
        var withoutClasses = options["without-classes"];

        do {
            if (withoutClasses.indexOf(cls.name) >= 0) {
                return true;
            }

            if (cls.superclassName) {
                cls = classes[cls.superclassName];
            } else {
                cls = null;
            }

        } while (cls && cls.name);

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
        var receiver   = node.receiver.value;
        var methodName = compiler.getMethodName(node.selectorName);
        var reserved   = Utils.isJScriptReservedWord(methodName);
        var hasArguments;

        var firstSelector, lastSelector;

        if (!node.messageSelectors) {
            console.log(node);
        }

        for (var i = 0, length = node.messageSelectors.length; i < length; i++) {
            var messageSelector = node.messageSelectors[i];

            if (!firstSelector) {
                firstSelector = messageSelector;
            }

            if (messageSelector.arguments) {
                var lastArgument = messageSelector.arguments[messageSelector.arguments.length - 1];

                hasArguments = true;
                modifier.from(messageSelector).to(messageSelector.arguments[0]).replace("[");
                modifier.after(lastArgument).insert("]");

                lastSelector = lastArgument;

            } else if (messageSelector.argument) {
                hasArguments = true;
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

        var startReplacement, endReplacement = ")";
        if (receiver.type == Syntax.Identifier && currentMethodNode && !reserved) {
            var selfOrThis = (currentMethodNode && currentMethodNode.usesSelfVar) ? "self" : "this";
            var useProto   = (currentMethodNode.selectorType != "+");

            if (receiver.name == "super") {
                startReplacement = currentClass.name + "." + OJSuperVariable + "." + (useProto ? "prototype." : "") + methodName + ".call(this" + (hasArguments ? "," : "");

            } else if (classes[receiver.name]) {
                startReplacement = "oj._cls." + compiler.getClassName(receiver.name) + "()." + methodName + "(";

            } else if (!options["always-message"]) {
                if (receiver.name == "self") {
                    startReplacement = selfOrThis + "." + methodName + "(";

                } else if (currentClass.isInstanceVariable(receiver.name)) {
                    var ivar = currentClass.generateThisIvar(receiver.name, currentMethodNode.usesSelfVar);
                    startReplacement = "(" + ivar + " && " + ivar + "." + methodName + "(";
                    endReplacement = "))";

                } else {
                    startReplacement = "(" + receiver.name + " && " + receiver.name + "." + methodName + "(";
                    endReplacement = "))";
                }
            }
        }

        if (startReplacement) {
            node.receiver.skip = true;
            modifier.from(node).to(firstSelector).replace(startReplacement);
            modifier.from(lastSelector).to(node).replace(endReplacement);
        } else {
            if (currentMethodNode) {
                currentMethodNode.usesTemporaryVar = true;

                modifier.from(node).to(receiver).replace("($ojr = (");

                if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
                    modifier.select(receiver).replace("oj._cls." + compiler.getClassName(receiver.name) + "()");
                }

                modifier.from(receiver).to(firstSelector).replace(")) && $ojr." + methodName + "(");
                modifier.from(lastSelector).to(node).replace(")");

            } else {
                modifier.from(node).to(receiver).replace("oj.msgSend(");

                if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
                    modifier.select(receiver).replace("oj._cls." + compiler.getClassName(receiver.name) + "()");
                }

                modifier.from(receiver).to(firstSelector).replace("," + getSelectorForMethodName(methodName) + (hasArguments ? "," : ""));
                modifier.from(lastSelector).to(node).replace(endReplacement);
            }

/*
            modifier.from(node).to(receiver).replace("oj.msgSend(");

            if (receiver.type == Syntax.Identifier && classes[receiver.name]) {
                modifier.select(receiver).replace("oj._cls." + compiler.getClassName(receiver.name) + "()");
            }

            modifier.from(receiver).to(firstSelector).replace("," + getSelectorForMethodName(methodName) + (hasArguments ? "," : ""));
            modifier.from(lastSelector).to(node).replace(endReplacement);
*/
        }
    }

    function handle_class_implementation(node)
    {
        var superClass = (node.superClass && node.superClass.value);

        var superSelector = "{ " + compiler.getClassName(superClass)   + ":1 }";
        var clsSelector   = "{ " + compiler.getClassName(node.id.name) + ":1 }";

        var constructorCallSuper = "";
        if (superClass) {
            constructorCallSuper = "oj._cls." + compiler.getClassName(superClass) + "().call(this);";
        }


        var constructorSetIvars = currentClass.generateIvarAssignments();

        var startText = "var " + node.id.name + " = oj._registerClass(" +
            clsSelector + ", " +
            (superClass ? superSelector : "null") + ", " +
            "function(" + OJClassMethodsVariable + ", " + OJInstanceMethodsVariable + ") { " +
            "function " + node.id.name + "() { " +
            constructorCallSuper +
            constructorSetIvars  +
            "this.constructor = " + node.id.name + ";" +
            "this.$oj_id = ++oj._id;" +
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

        for (var i = 0, length = node.methodSelectors.length; i < length; i++) {
            var variableName = node.methodSelectors[i].variableName;
            if (variableName) {
                args.push(variableName.name);
            }
        }

        var functionName = "";
        var functionNameStyle = options["function-name-style"];
        if (functionNameStyle == 1) {
            functionName = methodName;  
        } else if (functionNameStyle == 2) {
            functionName = currentClass.name + "$" + methodName;  
        }

        modifier.from(node).to(node.body).replace(where + "." + methodName + " = function " + functionName + "(" + args.join(", ") + ") ");

        if (node.usesSelfVar || node.usesTemporaryVar) {
            var parts = [ ];
            if (node.usesSelfVar)      parts.push("self = this");
            if (node.usesTemporaryVar) parts.push("$_ojr");

            if (parts.length && node.body.body.length) {
                modifier.before(node.body.body[0]).insert("var " + parts.join(",") + ";");
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
        var last = node;

        if (length) {
            var firstDeclaration = node.declarations[0];
            var lastDeclaration  = node.declarations[length - 1];
            var currentValue = 0;


            for (var i = 0; i < length; i++) {
                var declaration = node.declarations[i];

                if (declaration.value === undefined) {
                    modifier.after(declaration.id).insert("=" + currentValue);
                    currentValue++;
                } else {
                    currentValue = declaration.value + 1;
                }

                if (last == node) {
                    modifier.before(declaration.id).insert("/** @const */ var ");
                    modifier.from(last).to(declaration.id).remove();

                } else {
                    modifier.after(last).insert("; ");
                    modifier.from(last).to(declaration.id).insert("/** @const */ var ");
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

        if (length) {
            var firstDeclaration = node.declarations[0];
            modifier.from(node).to(firstDeclaration.id).replace("/** @const */ var ");

        } else {
            modifier.select(node).remove();
        }
    }


    function handle_instance_variable_or_self(node, useSelf)
    {
        var replacement;

        if (node.name == "self") {
            replacement = useSelf ? "self" : "this";
        } else {
            replacement = currentClass.generateThisIvar(node.name, useSelf);
        }

        modifier.select(node).replace(replacement);
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

    traverser.traverse(function() {
        var node = traverser.getNode();

        if (node.type === Syntax.OJMessageExpression) {
            handle_message_expression(node);

        } else if (node.type === Syntax.OJClassImplementation) {
            currentClass = classes[node.id.name];

            if (options["without-classes"] && should_remove_class(currentClass)) {
                modifier.select(node).remove();
                traverser.skip();
                return null;

            } else {
                handle_class_implementation(node);
            }

        } else if (node.type === Syntax.OJAtClassDirective) {
            modifier.select(node).remove();

        } else if (node.type === Syntax.OJInstanceVariableDeclarations) {
            modifier.select(node).remove();

        } else if (node.type === Syntax.OJMethodDefinition) {
            currentMethodNode = node;
            methodNodes.push(node);

        } else if (node.type === Syntax.OJAtPropertyDirective) {
            handle_at_property(node);

        } else if (node.type === Syntax.OJAtSynthesizeDirective || node.type == Syntax.OJAtDynamicDirective) {
            modifier.select(node).remove();

        } else if (node.type === Syntax.OJAtSelectorDirective) {
            handle_at_selector(node);

        } else if (node.type === Syntax.OJEnumDeclaration) {
            handle_enum_declaration(node);

        } else if (node.type === Syntax.VariableDeclaration && node.kind == "const" && options["use-const"]) {
            handle_const_declaration(node);

        } else if (node.type === Syntax.Literal) {
            handle_literal(node);

        } else if (node.type === Syntax.Identifier) {
            if (currentMethodNode && currentClass && can_be_instance_variable_or_self(traverser.getPath())) {
                if (currentClass.isInstanceVariable(node.name) || node.name == "self") {
                    handle_instance_variable_or_self(node, currentMethodNode && currentMethodNode.usesSelfVar);

                } else if (options["check-ivars"]) {
                    if (node.name[0] == "_" && (node.name.length > 1)) {
                        throwError(node, OJError.UndeclaredInstanceVariable, "Use of undeclared instance variable " + node.name);
                    }
                } 
            }

        } else if (node.type === Syntax.ThisExpression) {
            if (options["check-this"]) {
                check_this(node, traverser.getPath());
            }
        }

    }, function() {
        var node = traverser.getNode();

        if (node.type === Syntax.OJClassImplementation) {
            currentClass = null;
        } else if (node.type == Syntax.OJMethodDefinition) {
            currentMethodNode = null;
        }
    });

    finalize_method_nodes();

    this._ast = this._traverser.getAST();
}


OJCompiler.prototype.compile = function()
{
    this._firstPass();

    for (var className in this._classes) { if (this._classes.hasOwnProperty(className)) {
        this._classes[className].doDefaultSynthesis();
    }}

    this._secondPass();

    return this;
}


OJCompiler.prototype.finish = function()
{
    if (this._options["debug-ast"]) {
        return JSON.stringify(this._ast, null, 4);
    } else {
        return this._modifier.finish();
    }
}

return OJCompiler; })();


module.exports = {
    compile: function(src, opts) {
        return (new OJCompiler(src, opts)).compile().finish();
    }
};
