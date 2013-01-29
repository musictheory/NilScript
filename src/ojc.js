
var fs        = require('fs');
var util      = require("util");
var esprima   = require('esprima');
var escodegen = require('escodegen');
var Modifier  = require("./modifier").Modifier;
var Syntax    = esprima.Syntax;


function getMethodNameForSelectorName(selectorName)
{
    return selectorName.replace(/\:/g, "_");
}


var OJClass = (function () {

function OJClass(name)
{
    this.name = name;
    this._atPropertyNodes   = { };
    this._propertyToIvarMap = { };
    this._instanceMethods   = { };
    this._classMethods      = { };
    this._ivars             = { };
}


OJClass.prototype.registerAtProperty = function(node)
{
    var name = node.id.name;

    if (this._atPropertyNodes[name]) {
        //!i: Error, already a @property with this name
    }

    this._atPropertyNodes[name] = node;
}


OJClass.prototype.registerAtSynthesize = function(node)
{
    var pairs = node.pairs;

    for (var i = 0, length = pairs.length; i < length; i++) {
        var pair = pairs[i];
        var name = pair.id.name;
        var backing = pair.backing.name;

        if (this._propertyToIvarMap[name]) {
            //!i: Error, property already synthesized
        }

        if (backing) {
            this._propertyToIvarMap[name] = backing;
            this._ivars[backing] = true;
        } else {
            this._propertyToIvarMap[name] = name;
            this._ivars[name] = true;
        }
    }
}

OJClass.prototype.registerAtDynamic = function(node)
{
    var ids = node.ids;

    for (var i = 0, length = ids.length; i < length; i++) {
        var id = ids[i];
        var name = id.name;

        if (this._propertyToIvarMap[name]) {
            //!i: Error, property already synthesized
        }

        // Use true to indicate dynamic property
        this._propertyToIvarMap[name] = true;
    }
}

OJClass.prototype.registerMethodDefinition = function(node)
{
    var name = node.selectorName;
    var map  = (node.selectorType == "+") ? this._classMethods : this._instanceMethods;

    if (map[name]) {
        //!i: Error, method already defined
    }

    map[name] = node;
}


OJClass.prototype.isInstanceVariable = function(name)
{
    if (!this._didDefaultSynthesize) {
        var atPropertyNodes   = this._atPropertyNodes;
        var propertyToIvarMap = this._propertyToIvarMap;


        for (var propertyName in this._atPropertyNodes) { if (this._atPropertyNodes.hasOwnProperty(propertyName)) {
            if (!propertyToIvarMap[propertyName]) {
                this._ivars["_" + propertyName] = true;
                propertyName[propertyName] = "_" + propertyName;
            }
        }}

        this._didDefaultSynthesize = true;
    }

    return !!this._ivars[name];
}


OJClass.prototype.generateInitIvar = function(name)
{
    return "$oj_default_ivars." + this.name + "_" + name;
}


OJClass.prototype.generateThisIvar = function(name)
{
    return "this._" + this.name + "_" + name;
}


OJClass.prototype.generateMethodDeclaration = function(type, selector)
{
    var where = (type == "+") ? "$oj_class_methods" : "$oj_instance_methods";
    return where + "." + getMethodNameForSelectorName(selector);
}


OJClass.prototype.generateAccessorsForProperty = function(name)
{
    // It's dynamic, do not generate accessors
    if (this._propertyToIvarMap[name] === true) {
        return "";
    }

    var node       = this._atPropertyNodes[name];
    var getter     = name;
    var setter     = "set" + name.substr(0,1).toUpperCase() + name.substr(1, name.length);
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

    if (this._propertyToIvarMap[name]) {
        ivar = this._propertyToIvarMap[name];
    } else {
        ivar = "_" + name;
    }

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


return OJClass; })();


var OJCompiler = (function () {

function traverse(node, pre, post)
{
    var replacement = node;

    var result = pre(node);

    if (result === null || result) {
        replacement = result;
    }

    var keys = Object.keys(node);
    for (var i = 0, length = keys.length; i < length; i++) {
        var child = node[keys[i]];
        if (child && typeof child === "object") {
            var newChild = traverse(child, pre, post);
            if (newChild != child) {
                if (newChild) {
                    node[keys[i]] = newChild;
                } else {
                    delete(node[keys[i]]);
                }
            }
        }
    }

    if (post) post(node);

    return replacement;
}


function OJCompiler(src, options)
{
    this._modifier = new Modifier(src);
    this._ast = this._modifier.ast;
    this._options = options || { };
    this._classes = { };
}


OJCompiler.prototype._firstPass = function()
{
    var classes = this._classes;
    var currentClass;

    traverse(this._ast, function(node) {
        if (node.type === Syntax.OJClassImplementation) {
            currentClass = new OJClass(node.id.name);
            classes[node.id.name] = currentClass;

        } else if (node.type === Syntax.OJAtPropertyDirective) {
            currentClass.registerAtProperty(node);

        } else if (node.type === Syntax.OJAtSynthesizeDirective) {
            currentClass.registerAtSynthesize(node);

        } else if (node.type === Syntax.OJAtDynamicDirective) {
            currentClass.registerAtDynamic(node);

        } else if (node.type === Syntax.OJMethodDefinition) {
            currentClass.registerMethodDefinition(node);
        }

    }, function(node) {
        if (node.type === Syntax.OJClassImplementation) {
            currentClass = null;
        }
    });
}



OJCompiler.prototype._secondPass = function()
{
    var options  = this._options;
    var classes  = this._classes;
    var modifier = this._modifier;
    var currentClass;
    var inMethod;

    function getSelectorForMethodName(methodName)
    {
        return "{ " + methodName + ": " + "1 }";
    }


    function collapseSelectors(selectorNodes)
    {
        var firstSelectorStart, lastSelectorEnd;

        for (var i = 0, length = selectorNodes.length; i < length; i++) {
            var messageSelector = selectorNodes[i];
            if (!firstSelectorStart) {
                firstSelectorStart = messageSelector.loc.start;
            }

            if (messageSelector.argument) {
                hasArguments = true;
                modifier.remove(messageSelector.loc.start, messageSelector.argument.loc.start);
                lastSelectorEnd = messageSelector.argument.loc.end;

                if (i < (length - 1)) {
                    modifier.insert(messageSelector.argument.loc.end, ",");
                }

            } else {
                modifier.remove(messageSelector.loc.start, messageSelector.loc.end);
                lastSelectorEnd = messageSelector.loc.end;
            }
        }        

        return [ firstSelectorStart, lastSelectorEnd ];
    }


    function handle_message_expression(node)
    {
        var receiver = node.receiver.value;
        var methodName = getMethodNameForSelectorName(node.selectorName);
        var hasArguments;

        var ranges = collapseSelectors(node.messageSelectors);
        var firstSelectorStart = ranges[0];
        var lastSelectorEnd    = ranges[1];

        if (receiver.type == Syntax.Identifier) {
            receiver = receiver.name;
            var startReplacement;
            var endReplacement = ")";

            if (receiver == "self") {
                startReplacement = "this." + methodName + "(";
            } else if (receiver == "super") {
                startReplacement = "this.$oj_super." + methodName + ".call(this" + (hasArguments ? ", " : "");
            } else if (currentClass && currentClass.isInstanceVariable(receiver)) {
                startReplacement = currentClass.generateThisIvar(receiver);
            } else {
                startReplacement = receiver + "." + methodName + "(";
            }

            modifier.replace(node.loc.start, firstSelectorStart, startReplacement);
            modifier.replace(lastSelectorEnd, node.loc.end, endReplacement);

        } else {
            modifier.replace(node.loc.start, receiver.loc.start, "(");
            modifier.insert(receiver.loc.end, ")."  + methodName + "(");
            modifier.replace(lastSelectorEnd, node.loc.end, ")");
        }
    }

    function handle_class_implementation(node)
    {
        // Remove everything except for body and ivar storage
        modifier.remove(node.loc.start, node.ivarDeclarations ? node.ivarDeclarations.loc.start : node.body.loc.start);
        modifier.remove(node.body.loc.end, node.loc.end);

        var superClass = ((node.superClass && node.superClass.name) || "Object");

        var startText = "var " + node.id.name + " = $oj_class(" + superClass + ", function($oj_class_methods, $oj_instance_methods, $oj_default_ivars) {";

        modifier.insert(node.body.loc.end, "});");
        modifier.insert(node.loc.start, startText);
    }

    function handle_class_ivar_declaration(node)
    {
        var parameterType = node.parameterType ? node.parameterType.value : null;
        var defaultValue  = "null";
        var replacement = "";

        if (parameterType == "Boolean" || parameterType == "BOOL") {
            defaultValue = "false";
        } else if (parameterType == "Number") {
            defaultValue = "0";
        }

        for (var i = 0, length = node.ivars.length; i < length; i++) {
            replacement += currentClass.generateInitIvar(node.ivars[i].name) + " = " + defaultValue + "; ";
        }

        modifier.replace(node.loc.start, node.loc.end, replacement);
    }

    function handle_class_ivar_declarations(node)
    {
        var length = node.declarations ? node.declarations.length : 0;

        if (length) {
            var firstIvar = node.declarations[0];
            var lastIvar  = node.declarations[length - 1];

            modifier.replace(node.loc.start, firstIvar.loc.start, "$oj_default_ivars." + currentClass.name + " = { }; ");
            modifier.remove(lastIvar.loc.end, node.loc.end);

        } else {
            modifier.remove(node.loc.start, node.loc.end);
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

        modifier.replace(node.loc.start, node.body.loc.start, where + "." + methodName + " = function(" + args.join(", ") + ") ");
        modifier.remove(node.body.loc.end, node.loc.end);

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
            modifier.replace(node.loc.start, node.loc.end, replacement);
        }
    }

    function handle_at_property(node)
    {
        var name = node.id.name;
        var accessors = currentClass.generateAccessorsForProperty(name);
        modifier.replace(node.loc.start, node.loc.end, accessors);
    }

    function handle_identifier(node)
    {
        modifier.replace(node.loc.start, node.loc.end, currentClass.generateThisIvar(node.name));
    }

    this._ast = traverse(this._ast, function(node) {
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
            inMethod = true;
            handle_method_definition(node);

        } else if (node.type === Syntax.OJAtPropertyDirective) {
            handle_at_property(node);

        } else if (node.type === Syntax.OJAtSynthesizeDirective || node.type == Syntax.OJAtDynamicDirective) {
            modifier.remove(node.loc.start, node.loc.end);

        } else if (node.type === Syntax.Literal) {
            handle_literal(node);

        } else if (node.type === Syntax.Identifier) {
            if (inMethod && currentClass && currentClass.isInstanceVariable(node.name)) {
                handle_identifier(node);
            }
        }

    }, function(node) {
        if (node.type === Syntax.OJClassImplementation) {
            currentClass = null;
        } else if (node.type == Syntax.OJMethodDefinition) {
            inMethod = false;
        }
    });
}


OJCompiler.prototype.compile = function()
{
    this._firstPass();
    this._secondPass();

    return this;
}


OJCompiler.prototype.finish = function()
{
    if (this._options.ast) {
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
