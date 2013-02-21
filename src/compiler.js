
var esprima   = require && require('esprima');
var Modifier  = require && require("./modifier").Modifier;
var OJError   = require && require("./errors").OJError;
var Traverser = require && require("./traverser").Traverser;
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


function getMethodNameForSelectorName(selectorName)
{
    return selectorName.replace(/\:/g, "_");
}


var OJClass = (function () {

var OJDynamicProperty     = " OJDynamicProperty ";
var OJIvarWithoutProperty = " OJIvarWithoutProperty ";


function OJClass(name)
{
    this.name = name;
    this._atPropertyNodes   = { };
    this._propertyToIvarMap = { };
    this._ivarToPropertyMap = { };
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

    var jsName = getMethodNameForSelectorName(name);
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

    if (existingProperty && (existingProperty != OJIvarWithoutProperty)) {
        throwError(node, OJError.InstanceVariableAlreadyClaimed, "Both '" + property + "' and '" + existingProperty + "' claim instance variable '" + ivar);
    }

    this._propertyToIvarMap[property] = ivar;
    this._ivarToPropertyMap[ivar] = property;
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


OJClass.prototype.generateDefaultIvar = function(name)
{
    return "$oj_default_ivars.$oj_ivar_" + this.name + "_" + name;
}


OJClass.prototype.generateDefaultIvarAssignments = function(names, parameterType)
{
    var defaultValue = "null";

    if (parameterType == "Boolean" || parameterType == "BOOL") {
        defaultValue = "false";
    } else if (parameterType == "Number") {
        defaultValue = "0";
    }

    var result = "";
    for (var i = 0, length = names.length; i < length; i++) {
        result += this.generateDefaultIvar(names[i]) + " = " + defaultValue + "; ";
    }

    return result;
}


OJClass.prototype.generateThisIvar = function(name, useSelf)
{
    return (useSelf ? "self" : "this") + ".$oj_ivar_" + this.name + "_" + name;
}


OJClass.prototype.generateMethodDeclaration = function(type, selector)
{
    var where = (type == "+") ? "$oj_class_methods" : "$oj_instance_methods";
    return where + "." + getMethodNameForSelectorName(selector);
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
    this._modifier  = new Modifier(src);
    this._ast       = esprima.parse(src, { loc: true });
    this._options   = options || { };
    this._classes   = { };
    this._traverser = null;
}


OJCompiler.prototype._firstPass = function()
{
    var classes = this._classes;
    var currentClass, currentMethodNode, functionInMethodCount = 0;

    var traverser = new Traverser(this._ast);
    this._traverser = traverser;

    traverser.traverse(function() {
        var node = traverser.getNode();

        if (node.type === Syntax.OJClassImplementation) {
            currentClass = new OJClass(node.id.name);
            classes[node.id.name] = currentClass;

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
    var options  = this._options;
    var classes  = this._classes;
    var modifier = this._modifier;
    var currentClass;
    var currentMethodNode;

    function getSelectorForMethodName(methodName)
    {
        return "{ " + methodName + ": " + "1 }";
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

        if (parentNode.type == Syntax.MemberExpression) {
            return parentNode.object == idNode;
        }

        return true;   
    }

    function handle_message_expression(node)
    {
        var receiver = node.receiver.value;
        var methodName = getMethodNameForSelectorName(node.selectorName);
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

        var startReplacement;
        if (receiver.type == Syntax.Identifier && currentMethodNode) {
            var selfOrThis = (currentMethodNode && currentMethodNode.usesSelfVar) ? "self" : "this";
            var useProto   = (currentMethodNode.selectorType != "+");

            if (receiver.name == "self") {
                startReplacement = selfOrThis + "." + methodName + "(";
            } else if (receiver.name == "super") {
                startReplacement = currentClass.name + ".$oj_super." + (useProto ? "prototype." : "") + methodName + ".call(this" + (hasArguments ? "," : "");
            }
        }

        if (startReplacement) {
            node.receiver.skip = true;
            modifier.from(node).to(firstSelector).replace(startReplacement);
            modifier.from(lastSelector).to(node).replace(")");
        } else {
            modifier.from(node).to(receiver).replace("$oj.oj_msgSend(");
            modifier.from(receiver).to(firstSelector).replace("," + getSelectorForMethodName(methodName) + (hasArguments ? "," : ""));
            modifier.from(lastSelector).to(node).replace(")");
        }
    }

    function handle_class_implementation(node)
    {
        var superClass = ((node.superClass && node.superClass.value) || "null");
        var startText = "var " + node.id.name + " = $oj.makeClass(" + superClass + ", { " + node.id.name + ":1 }, function($oj_class_methods, $oj_instance_methods, $oj_default_ivars) {";

        if (!options || !options["no-strict"]) {
            startText += " \"use strict\"; "
        }

        modifier.from(node).to(node.ivarDeclarations || node.body).replace(startText);
        modifier.from(node.body).to(node).replace("});");
    }

    function handle_class_ivar_declaration(node)
    {
        var parameterType = node.parameterType ? node.parameterType.value : null;

        var names = [ ];
        for (var i = 0, length = node.ivars.length; i < length; i++) {
            names.push(node.ivars[i].name);
        }

        modifier.select(node).replace(
            currentClass.generateDefaultIvarAssignments(names, parameterType)
        );
    }

    function handle_class_ivar_declarations(node)
    {
        var length = node.declarations ? node.declarations.length : 0;

        if (length) {
            var firstIvar = node.declarations[0];
            var lastIvar  = node.declarations[length - 1];

            modifier.from(node).to(firstIvar).replace("$oj_default_ivars." + currentClass.name + " = { }; ");
            modifier.from(lastIvar).to(node).remove();

        } else {
            modifier.select(node).remove();
        }
    }

    function handle_method_definition(node)
    {
        var methodName = getMethodNameForSelectorName(node.selectorName);
        var where = (node.selectorType == "+") ? "$oj_class_methods" : "$oj_instance_methods";
        var args = [ ];

        for (var i = 0, length = node.methodSelectors.length; i < length; i++) {
            var variableName = node.methodSelectors[i].variableName;
            if (variableName) {
                args.push(variableName.name);
            }
        }

        modifier.from(node).to(node.body).replace(where + "." + methodName + " = function(" + args.join(", ") + ") ");

        if (node.usesSelfVar) {
            // Need a better way to add variables to a method declaration
            if (node.body.body.length) {
                modifier.before(node.body.body[0]).insert("var self = this;");
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
        var init = currentClass.generateDefaultIvarAssignments([ ivar ], parameterType);

        modifier.select(node).replace(accessors + " " + init);

        node.skip = true;
    }


    function handle_at_selector(node)
    {
        var name = getMethodNameForSelectorName(node.name);
        modifier.select(node).replace("{ " + name + ": 1 }");
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

    var traverser = new Traverser(this._ast);
    this._traverser = traverser;

    traverser.traverse(function() {
        var node = traverser.getNode();

        if (node.type === Syntax.OJMessageExpression) {
            handle_message_expression(node);

        } else if (node.type === Syntax.OJClassImplementation) {
            currentClass = classes[node.id.name];
            handle_class_implementation(node);

        } else if (node.type === Syntax.OJInstanceVariableDeclaration) {
            handle_class_ivar_declaration(node);

        } else if (node.type === Syntax.OJInstanceVariableDeclarations) {
            handle_class_ivar_declarations(node);

        } else if (node.type === Syntax.OJMethodDefinition) {
            currentMethodNode = node;
            handle_method_definition(node);

        } else if (node.type === Syntax.OJAtPropertyDirective) {
            handle_at_property(node);

        } else if (node.type === Syntax.OJAtSynthesizeDirective || node.type == Syntax.OJAtDynamicDirective) {
            modifier.select(node).remove();

        } else if (node.type === Syntax.OJAtSelectorDirective) {
            handle_at_selector(node);

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
            if (currentMethodNode && currentClass && options["check-this"]) {
                throwError(node, OJError.UseOfThisInMethod, "Use of 'this' keyword in oj method definition");
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
    if (this._options["ast"]) {
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
