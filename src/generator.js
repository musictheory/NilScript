/*
    generator.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var _          = require("lodash");
var esprima    = require("./esprima");
var Syntax     = esprima.Syntax;

var Modifier   = require("./modifier");
var Traverser  = require("./traverser");
var Utils      = require("./utils");

var OJModel    = require("./model").OJModel;
var OJError    = require("./errors").OJError;
var OJWarning  = require("./errors").OJWarning;

var OJGlobalVariable          = "$oj_oj";

var OJClassPrefix             = "$oj_c_";
var OJMethodPrefix            = "$oj_f_";
var OJIvarPrefix              = "$oj_i_";
var OJClassMethodsVariable    = "$oj_s";
var OJInstanceMethodsVariable = "$oj_m";
var OJTemporaryReturnVariable = "$oj_r";
var OJSuperVariable           = "$oj_super";

var LanguageEcmascript5 = "ecmascript5";
var LanguageTypechecker = "typechecker";
var LanguageNone        = "none";


function Generator(ast, model, modifier, forTypechecker, options)
{
    this._ast      = ast;
    this._model    = model;
    this._modifier = modifier;
    this._options  = options;
    this._warnings = [ ];

    var inlines = { };

    var language = options["output-language"];
    if (language && language.match(/typechecker/)) {
        this._language = LanguageTypechecker;
    } else if (language && language.match(/none/)) {
        this._language = LanguageNone;
    } else {
        this._language = LanguageEcmascript5;
    }

    if (forTypechecker || (this._language == LanguageTypechecker)) {
        this._language = LanguageTypechecker;
        forTypechecker = true;

        this._strictFunctions = options["strict-functions"];
    }

    // Typechecker inlines anonymous enums
    if (options["inline-enum"] || forTypechecker) {
        _.each(model.enums, function(e) {
            var enumName = e.name;

            _.each(e.values, function(value, name) {
                if (enumName && forTypechecker) {
                    inlines[name] = enumName + "." + name;
                } else {
                    inlines[name] = value;
                }
            });
        });
    }

    // Typechecker forces 'inline-const'
    if (options["inline-const"] || forTypechecker) {
        _.each(model.consts, function(value, name) {
            if (inlines[name] === undefined) {
                inlines[name] = value;
            }
        });
    }

    var additionalInlines = options["additional-inlines"];
    if (additionalInlines) {
        for (var key in additionalInlines) {
            if (additionalInlines.hasOwnProperty(key)) {
                inlines[key] = JSON.stringify(additionalInlines[key]);
            }
        }
    }

    this._inlines = inlines;
    this._squeeze = options["squeeze"] && (language != LanguageTypechecker);

    var knownTypes = { };
    var generator = this;
    if (forTypechecker) {
        _.each(model.classes, function(value) {
            var name = generator.getSymbolForClassName(value.name);
            knownTypes[name] = name;
            knownTypes[name + "$Static"] = name + "$Static";
            knownTypes[value.name] = name;
        });
    }

    this._knownTypes = knownTypes;
}


Generator.prototype.getTypecheckerType = function(inType, currentClass)
{
    var value;

    if (inType == "String" || inType == "string") {
        return "string";
    } else if (this._model.isNumericType(inType)) {
        return "number";
    } else if (this._model.isBooleanType(inType)) {
        return "boolean";
    } else if (inType == "Array") {
        return "any[]";
    } else if (inType == "void") {
        return "void";
    } else if (inType == "instancetype" && currentClass) {
        return this.getTypecheckerType(currentClass.name);
    } else if ((value = this._knownTypes[inType])) {
        return value;
    } else {
        return "any";
    }
}


Generator.prototype.getSymbolicatedString = function(inString)
{
    return inString.replace(/\$oj[_$][A-Za-z_$]+/g, function(symbol) {
        if (symbol.indexOf("$oj$") === 0) {
            return symbol;
            // Unsqueeze
        } else if (symbol.indexOf(OJClassPrefix) === 0) {
            return symbol.substr(OJClassPrefix.length);

        } else if (symbol.indexOf(OJMethodPrefix) === 0) {
            symbol = symbol.substr(OJMethodPrefix.length);
            symbol = symbol.replace(/_([^_])/g, ":$1");
            symbol = symbol.replace(/_$/g,      ":");
            symbol = symbol.replace(/__/g,    "_");
            symbol = symbol.replace(/^\:/g,   "_");

            return symbol;

        } else if (symbol.indexOf(OJIvarPrefix) === 0) {
            return symbol.substr(OJIvarPrefix.length).split("$").pop();

        } else {
            return symbol;
        }
    });
}


Generator.prototype.getSymbolForClassName = function(className)
{
    if (!className) return;

    if (!Utils.isBaseObjectClass(className)) {
        if (this._squeeze) {
            return this._model.getSqueezedName(OJClassPrefix + className, true);
        } else {
            return OJClassPrefix + className;
        }
    }

    return className;
}


Generator.prototype.getSymbolForSelectorName = function(selectorName)
{
    var replacedName = selectorName;
    replacedName = replacedName.replace(/_/g,   "__");
    replacedName = replacedName.replace(/^__/g, "_");
    replacedName = replacedName.replace(/\:/g,  "_");

    if (!Utils.isBaseObjectSelectorName(selectorName)) {
        if (this._squeeze) {
            return this._model.getSqueezedName(OJMethodPrefix + replacedName, true);
        } else {
            return OJMethodPrefix + replacedName;
        }
    }

    return replacedName;
}


Generator.prototype.getSymbolForClassNameAndIvarName = function(className, ivarName)
{
    var result = OJIvarPrefix + className + "$" + ivarName;
    if (this._squeeze) result = this._model.getSqueezedName(result, true);
    return result;
}


Generator.prototype.getSymbolForIvar = function(ivar)
{
    return this.getSymbolForClassNameAndIvarName(ivar.className, ivar.name);
}


Generator.prototype.generate = function()
{
    var traverser = new Traverser(this._ast);

    var generator = this;

    var model    = this._model;
    var modifier = this._modifier;
    var language = this._language;
    var options  = this._options;
    var inlines  = this._inlines;

    var methodNodes = [ ];
    var methodNodeClasses = [ ];
    var currentClass;
    var currentMethodNode;

    var methodUsesSelfVar        = false;
    var methodUsesTemporaryVar   = false;
    var methodUsesLoneExpression = false;

    var optionWarnOnThisInMethods    = options["warn-this-in-methods"];
    var optionWarnOnUnknownSelectors = options["warn-unknown-selectors"];
    var optionWarnOnUnusedIvars      = options["warn-unused-ivars"];
    var optionWarnOnUnknownIvars     = options["warn-unknown-ivars"];
    var optionStrictFunctions        = options["strict-functions"];

    var optionSqueeze = this._squeeze;

    var removeEnums    = options["inline-enum"]  || (language === LanguageTypechecker);
    var removeConsts   = options["inline-const"] || (language === LanguageTypechecker);
    var removeTypes    =                            (language !== LanguageTypechecker);
    var knownSelectors = optionWarnOnUnknownSelectors ? model.selectors : null;

    var warnings = this._warnings;

    function getClassAsRuntimeVariable(className)
    {
        if (language === LanguageEcmascript5) {
            return OJGlobalVariable + "._cls." + generator.getSymbolForClassName(className);
        }

        return generator.getSymbolForClassName(className);
    }

    function getCurrentMethodInModel() {
        if (!currentClass || !currentMethodNode) return null;

        var selectorType = currentMethodNode.selectorType;
        var selectorName = currentMethodNode.selectorName;

        if (selectorType == "+") {
            return currentClass.getClassMethodWithName(selectorName);
        } else {
            return currentClass.getInstanceMethodWithName(selectorName);
        }
    }

    function generateMethodDeclaration(isClassMethod, selectorName)
    {
        if (language === LanguageEcmascript5) {
            var where = isClassMethod ? OJClassMethodsVariable : OJInstanceMethodsVariable;

            if (Utils.isJScriptReservedWord(selectorName)) {
                // For IE8
                return where + "[\"" + generator.getSymbolForSelectorName(selectorName) + "\"]";
            } else {
                return where + "." + generator.getSymbolForSelectorName(selectorName);
            }
        }
    }

    function generateThisIvar(className, ivarName, useSelf)
    {
        return (useSelf ? "self" : "this") + "." + generator.getSymbolForClassNameAndIvarName(className, ivarName);
    }

    function generateIvarAssignments(ojClass)
    {
        var booleanIvars = [ ];
        var numericIvars = [ ];
        var objectIvars  = [ ];
        var i, length, ivar;

        var ivars = ojClass.getAllIvars();

        for (i = 0, length = ivars.length; i < length; i++) {
            var ivar = ivars[i];

            if (model.isNumericType(ivar.type)) {
                numericIvars.push(ivar.name);
            } else if (model.isBooleanType(ivar.type)) {
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
                result += "this." + generator.getSymbolForClassNameAndIvarName(ojClass.name, objectIvars[i]) + "="
            }

            result += "null;"
        }

        if (numericIvars.length) {
            for (i = 0, length = numericIvars.length; i < length; i++) {
                result += "this." + generator.getSymbolForClassNameAndIvarName(ojClass.name, numericIvars[i]) + "="
            }

            result += "0;"
        }

        if (booleanIvars.length) {
            for (i = 0, length = booleanIvars.length; i < length; i++) {
                result += "this." + generator.getSymbolForClassNameAndIvarName(ojClass.name, booleanIvars[i]) + "="
            }

            result += "false;"
        }

        return result;
    }


    function canBeInstanceVariableOrSelf(node)
    {
        var parent = node.parent;

        if (parent.type == Syntax.MemberExpression && !parent.computed) {
            return parent.object == node;
        }

        return true;   
    }

    function handleMessageExpression(node)
    {
        var receiver     = node.receiver.value;
        var methodName   = generator.getSymbolForSelectorName(node.selectorName);
        var reserved     = Utils.isJScriptReservedWord(methodName);
        var hasArguments = false;

        var firstSelector, lastSelector;

        if (knownSelectors && !knownSelectors[node.selectorName]) {
            warnings.push(Utils.makeError(OJWarning.UnknownSelector, "Use of unknown selector '" + node.selectorName + "'", node));
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
        if (receiver.type == Syntax.Identifier && currentMethodNode && !reserved) {
            var usesSelf   = methodUsesSelfVar || (language === LanguageTypechecker);
            var selfOrThis = usesSelf ? "self" : "this";
            var useProto   = (currentMethodNode.selectorType != "+");

            if (receiver.name == "super") {
                if (language === LanguageEcmascript5) {
                    doCommonReplacement(currentClass.name + "." + OJSuperVariable + "." + (useProto ? "prototype." : "") + methodName + ".call(this" + (hasArguments ? "," : ""), ")");
                } else {
                    var method = getCurrentMethodInModel();
                    var cast = "";

                    if (method.returnType == "instancetype") {
                        cast = "<" + generator.getTypecheckerType(currentClass.name) + ">";
                    }

                    doCommonReplacement(cast + selfOrThis + ".$oj_super()." + methodName + "(", ")");
                }
                return;

            } else if (model.classes[receiver.name]) {
                var classVariable = getClassAsRuntimeVariable(receiver.name);

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
                var ivar = generateThisIvar(currentClass.name, receiver.name, usesSelf);

                methodUsesLoneExpression = true;

                if (language === LanguageTypechecker) {
                    doCommonReplacement("(" + ivar + "." + methodName + "(", "))");
                } else {
                    doCommonReplacement("(" + ivar + " && " + ivar + "." + methodName + "(", "))");
                }

                return;

            } else {
                methodUsesLoneExpression = true;

                if (language === LanguageTypechecker) {
                    doCommonReplacement("(" + receiver.name + "." + methodName + "(", "))");
                } else {
                    doCommonReplacement("(" + receiver.name + " && " + receiver.name + "." + methodName + "(", "))");
                }

                return;
            }

        } else if (currentMethodNode) {
            methodUsesTemporaryVar   = true;
            methodUsesLoneExpression = true;

            replaceMessageSelectors();

            if (language === LanguageTypechecker) {
                modifier.from(node).to(receiver).replace("(");

                if (receiver.type == Syntax.Identifier && model.classes[receiver.name]) {
                    modifier.select(receiver).replace(getClassAsRuntimeVariable(receiver.name));
                }

                modifier.from(receiver).to(firstSelector).replace("." + methodName + "(");
                modifier.from(lastSelector).to(node).replace("))");

            } else {
                modifier.from(node).to(receiver).replace("((" + OJTemporaryReturnVariable + " = (");

                if (receiver.type == Syntax.Identifier && model.classes[receiver.name]) {
                    modifier.select(receiver).replace(getClassAsRuntimeVariable(receiver.name));
                }

                modifier.from(receiver).to(firstSelector).replace(")) && " + OJTemporaryReturnVariable + "." + methodName + "(");
                modifier.from(lastSelector).to(node).replace("))");
            }

            return;
        }

        // Slow path
        replaceMessageSelectors();

        modifier.from(node).to(receiver).replace(OJGlobalVariable + ".msgSend(");

        if (receiver.type == Syntax.Identifier && model.classes[receiver.name]) {
            modifier.select(receiver).replace(getClassAsRuntimeVariable(receiver.name));
        }

        var selector;
        if (Utils.isJScriptReservedWord(methodName)) {
            selector = "{ \"" + methodName + "\": " + "1 }";
        } else {
            selector = "{ " + methodName + ": " + "1 }";
        }

        modifier.from(receiver).to(firstSelector).replace("," + selector + (hasArguments ? "," : ""));
        modifier.from(lastSelector).to(node).replace(")");
    }

    function handleClassImplementation(node)
    {
        var superClass = (node.superClass && node.superClass.value);

        var superSelector = "{ " + generator.getSymbolForClassName(superClass)   + ":1 }";
        var clsSelector   = "{ " + generator.getSymbolForClassName(node.id.name) + ":1 }";

        var constructorCallSuper = "";
        if (superClass) {
            constructorCallSuper = getClassAsRuntimeVariable(superClass) + ".call(this);";
        }


        var constructorSetIvars = generateIvarAssignments(currentClass);

        var startText;
        var endText;

        if (language === LanguageEcmascript5) {
            startText = "var " + node.id.name + " = " + OJGlobalVariable + "._registerClass(" +
                clsSelector + ", " +
                (superClass ? superSelector : "null") + ", " +
                "function(" + OJClassMethodsVariable + ", " + OJInstanceMethodsVariable + ") { " +
                "function " + node.id.name + "() { " +
                constructorCallSuper +
                constructorSetIvars  +
                "this.constructor = " + node.id.name + ";" +
                "this.$oj_id = ++" + OJGlobalVariable + "._id;" +
                "}";

            endText = "return " + node.id.name + ";});";
        
        } else if (language === LanguageTypechecker) {
            startText = "var $oj_unused = function(" + OJClassMethodsVariable + ", " + OJInstanceMethodsVariable + ") { ";
            endText = "}";
        } 

        modifier.from(node).to(node.ivarDeclarations || node.body).replace(startText);
        modifier.from(node.body).to(node).replace(endText);
    }

    function handleMethodDefinition(node)
    {
        var methodName = generator.getSymbolForSelectorName(node.selectorName);
        var isClassMethod = node.selectorType == "+";
        var where = isClassMethod ? OJClassMethodsVariable : OJInstanceMethodsVariable;
        var args = [ ];

        if (Utils.isReservedSelectorName(node.selectorName)) {
            Utils.throwError(OJError.ReservedMethodName, "The method name \"" + node.selectorName + "\" is reserved by the runtime and may not be overridden.", node);
        }

        if (language === LanguageTypechecker) {
            args.push("self" + (isClassMethod ? "" : " : " + generator.getSymbolForClassName(currentClass.name)));
        }

        for (var i = 0, length = node.methodSelectors.length; i < length; i++) {
            var variableName = node.methodSelectors[i].variableName;
            var methodType   = node.methodSelectors[i].methodType;

            if (variableName) {
                if (language === LanguageEcmascript5) {
                    args.push(variableName.name);
                } else if (language === LanguageTypechecker) {
                    args.push(variableName.name + (methodType ? (" : " + generator.getTypecheckerType(methodType.value)) : ""));
                }
            }
        }

        var definition = where + "." + methodName + " = function(" + args.join(", ") + ") ";

        if (language === LanguageTypechecker) {
            definition += ": " + generator.getTypecheckerType(getCurrentMethodInModel().returnType, currentClass);
        }

        modifier.from(node).to(node.body).replace(definition);

        if (methodUsesSelfVar || methodUsesTemporaryVar || methodUsesLoneExpression) {
            var toInsert = "";

            var varParts = [ ];

            if (methodUsesSelfVar && (language !== LanguageTypechecker)) varParts.push("self = this");
            if (methodUsesTemporaryVar) varParts.push(OJTemporaryReturnVariable);

            if (methodUsesLoneExpression) {
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

    function handleLiteral(node)
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

    function handleIdentifier(node)
    {
        var name = node.name;

        if (name.indexOf("$oj") == 0) {
            if (name[3] == "$" || name[3] == "_") {
                Utils.throwError(OJError.DollarOJIsReserved, "Identifiers may not start with \"$oj_\" or \"$oj$\"", node);
            }
        }

        if (currentMethodNode && currentClass && canBeInstanceVariableOrSelf(node)) {
            if (currentClass.isIvar(name) || name == "self") {
                var usesSelf = currentMethodNode && methodUsesSelfVar;
                var replacement;

                if (name == "self") {
                    replacement = usesSelf ? "self" : "this";
                } else {
                    replacement = generateThisIvar(currentClass.name, name, usesSelf);

                    // remove ivar from unusedIvars
                    if (optionWarnOnUnusedIvars) {
                        if (unusedIvars && unusedIvars.indexOf(name) >= 0) {
                            unusedIvars = _.without(unusedIvars, name);
                        }
                    }
                }

                modifier.select(node).replace(replacement);

            } else {
                if (name[0] == "_" && optionWarnOnUnknownIvars && (name.length > 1)) {
                    warnings.push(Utils.makeError(OJWarning.UndeclaredInstanceVariable, "Use of undeclared instance variable " + node.name, node));
                }
            } 
        }

        if (inlines) {
            var result = inlines[name];
            if (result !== undefined) {
                if (inlines.hasOwnProperty(name)) {
                    modifier.select(node).replace("" + result);
                    return;
                }
            }
        }

        if (optionSqueeze) {
            var result = model.getSqueezedName(name, false);
            if (result !== undefined) {
                modifier.select(node).replace("" + result);
                return;
            }
        }

        if (node.annotation) {
            if (language === LanguageTypechecker) {
                var inType  = node.annotation.value;
                var outType = generator.getTypecheckerType(inType);
                modifier.select(node.annotation).replace(": " + outType);
            } else {
                modifier.select(node.annotation).remove();
            }
        }
    }

    function handleAtPropertyDirective(node)
    {
        var name = node.id.name;

        var makeGetter = currentClass.shouldGenerateGetterImplementationForPropertyName(name);
        var makeSetter = currentClass.shouldGenerateSetterImplementationForPropertyName(name);
        var property   = currentClass.getPropertyWithName(name);

        var result = "";
        if (makeSetter) {
            if (language === LanguageEcmascript5) {
                result += generateMethodDeclaration(false, property.setter);
                result += " = function(arg) { " + generateThisIvar(currentClass.name, property.ivar, false) + " = arg; } ; ";
            }
        }

        if (makeGetter) {
            if (language === LanguageEcmascript5) {
                result += generateMethodDeclaration(false, property.getter);
                result += " = function() { return " + generateThisIvar(currentClass.name, property.ivar, false) + "; } ; ";
            }
        }

        if (!result) {
            modifier.select(node).remove();
        } else {
            modifier.select(node).replace(result);
        }
    }

    function handleAtSelectorDirective(node)
    {
        var name = generator.getSymbolForSelectorName(node.name);

        if (knownSelectors && !knownSelectors[node.name]) {
            warnings.push(Utils.makeError(OJWarning.UnknownSelector, "Use of unknown selector '" + node.selectorName + "'", node));
        }

        modifier.select(node).replace("{ " + name + ": 1 }");
    }

    function handleEnumDeclaration(node)
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

    function handleConstDeclaration(node)
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

    function handleAtCastExpression(node)
    {
        var before = "(";

        if (language == LanguageTypechecker) {
            before = "<" + generator.getTypecheckerType(node.id.name) + ">(";
        }

        modifier.from(node).to(node.argument).replace(before);
        modifier.from(node.argument).to(node).replace(")");
    }

    function handleTypeAnnotation(node)
    {
        var inValue  = node.inValue;
        var outValue = generator.getTypecheckerType(inValue);

        if (inValue != outValue) {
            modifier.select(node).replace(": " + outValue);
        }
    }

    function handleObjectExpression_typeCheckerOnly(node)
    {
        if (language !== LanguageTypechecker) return;

        // We only want TypeScript errors for oj types and simple primitives
        
        if (node.properties.length == 0) {
            modifier.select(node).replace("<any>{}");
        } else {
            modifier.from(node).to(node.properties[0]).replace("<any>{");
        }
    }

    function handleFunctionDeclarationOrExpression_typeCheckerOnly(node)
    {
        if (language !== LanguageTypechecker) return;
        if (optionStrictFunctions) return;

        // Unlike JavaScript, TypeScript assumes every parameter to a function is required.
        // This results in many false positives for our JavaScript code
        //
        // Disable this by rewriting the parameter list

        var result = "function " + (node.id ? node.id.name : "") + "(";

        for (var i = 0, length = node.params.length; i < length; i++) {
            var param = node.params[i];

            var type = "any";
            if (param.annotation) {
                type = generator.getTypecheckerType(param.annotation.value);
            }

            result += param.name + "? : " + type + ", ";
        }

        result += "...$oj_rest)";

        modifier.from(node).to(node.body).replace(result);
    }

    function checkThis(thisNode, path)
    {
        var inFunction = false;
        var inMethod   = true;

        for (var i = path.length - 1; i >= 0; i--) {
            var node = path[i];

            if (node.type == Syntax.OJMethodDefinition ||
                node.type == Syntax.OJClassImplementation ||
                node.type == Syntax.OJMessageExpression)
            {
                warnings.push(Utils.makeError(OJWarning.UseOfThisInMethod, "Use of 'this' keyword in oj method definition", thisNode));

            } else if (node.type == Syntax.FunctionDeclaration ||
                       node.type == Syntax.FunctionExpression) {
                break;
            }
        }
    }

    traverser.traverse(function(node, parent) {
        var type = node.type;

        if (node.skip) return Traverser.SkipNode;

        if (type === Syntax.OJProtocolDefinition                 ||
            type === Syntax.OJAtClassDirective                   ||
            type === Syntax.OJAtSqueezeDirective                 ||
            type === Syntax.OJInstanceVariableDeclarations       ||
            type === Syntax.OJAtSynthesizeDirective              ||
            type === Syntax.OJAtDynamicDirective                 ||
            type === Syntax.OJAtTypedefDeclaration               ||
          ((type === Syntax.OJEnumDeclaration)  && removeEnums)  ||
          ((type === Syntax.OJConstDeclaration) && removeConsts) ||
          ((type === Syntax.OJTypeAnnotation)   && removeTypes)
        ) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.OJClassImplementation) {
            currentClass = model.classes[node.id.name];

            if (optionWarnOnUnusedIvars) {
                unusedIvars = currentClass.getAllIvarNamesWithoutProperties();
            }

            handleClassImplementation(node);

        } else if (type === Syntax.OJMethodDefinition) {
            currentMethodNode        = node;
            methodUsesSelfVar        = false;
            methodUsesTemporaryVar   = false;
            methodUsesLoneExpression = false;

        } else if (type === Syntax.OJMessageExpression) {
            handleMessageExpression(node);

        } else if (type === Syntax.OJAtPropertyDirective) {
            handleAtPropertyDirective(node);
            return Traverser.SkipNode;

        } else if (type === Syntax.OJAtSelectorDirective) {
            handleAtSelectorDirective(node);

        } else if (type === Syntax.OJEnumDeclaration) {
            handleEnumDeclaration(node);

        } else if (type === Syntax.OJConstDeclaration) {
            handleConstDeclaration(node);

        } else if (type === Syntax.OJAtCastExpression) {
            handleAtCastExpression(node);

        } else if (type === Syntax.OJTypeAnnotation) {
            handleTypeAnnotation(node);

        } else if (type === Syntax.Literal) {
            handleLiteral(node);

        } else if (type === Syntax.Identifier) {
            handleIdentifier(node);

        } else if (type === Syntax.ThisExpression) {
            if (optionWarnOnThisInMethods) {
                checkThis(node, traverser.getParents());
            }

        } else if (type === Syntax.AssignmentExpression) {
            if (currentMethodNode &&
                node.left &&
                node.left.type == Syntax.Identifier &&
                node.left.name == "self")
            {
                methodUsesSelfVar = true;
            }

        } else if (type === Syntax.ObjectExpression) {
            if (language === LanguageTypechecker) {
                handleObjectExpression_typeCheckerOnly(node);
            }

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression) {
            if (language === LanguageTypechecker) {
                handleFunctionDeclarationOrExpression_typeCheckerOnly(node);
            }
            methodUsesSelfVar = true;
        }

    }, function(node, parent) {
        var type = node.type;

        if (type === Syntax.OJClassImplementation) {
            currentClass = null;

            if (optionWarnOnUnusedIvars && unusedIvars && unusedIvars.length) {
                _.each(unusedIvars, function(unusedIvar) {
                    warnings.push(Utils.makeError(OJWarning.UnusedInstanceVariable, "Unused instance variable " + unusedIvar, node));
                });

                unusedIvars = null;
            }

        } else if (type === Syntax.OJMethodDefinition) {
            handleMethodDefinition(node);
            currentMethodNode = null;
        }
    });
}


Generator.prototype.finish = function()
{
    var result = this._modifier.finish();
    result.warnings = this._warnings;
    return result;
}


module.exports = Generator;
