/*
    Generator.js
    Generates JavaScript or TypeScript from input code/AST/model
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { Modifier  } from "./Modifier.js";
import { NSError   } from "./Errors.js";
import { NSWarning } from "./Errors.js";
import { Syntax    } from "./Parser.js";
import { Traverser } from "./Traverser.js";
import { Utils     } from "./Utils.js";

import { NSModel   } from "./model/NSModel.js";


const NSRootVariable  = "N$$_";
const NSSuperVariable = "N$_super";

const NSRootWithGlobalPrefix = NSRootVariable + "._g.";
const NSRootWithClassPrefix  = NSRootVariable + "._c.";

const LanguageEcmascript5 = "ecmascript5";
const LanguageTypechecker = "typechecker";
const LanguageNone        = "none";


export class Generator {


constructor(nsFile, model, options)
{
    this._file     = nsFile;
    this._model    = model;
    this._modifier = new Modifier(nsFile.contents.split("\n"), options);
    this._options  = options;

    let inlines = { };
    let symbolTyper = model.getSymbolTyper();

    let language = options["output-language"];
    if (language && language.match(/typechecker/)) {
        this._language = LanguageTypechecker;
    } else if (language && language.match(/none/)) {
        this._language = LanguageNone;
    } else {
        this._language = LanguageEcmascript5;
    }

    _.each(model.enums, nsEnum => {
        let enumNameSymbol = (nsEnum.name && !nsEnum.anonymous) ? symbolTyper.getSymbolForEnumName(nsEnum.name) : null;

        _.each(nsEnum.values, (value, name) => {
            if (enumNameSymbol && (this._language == LanguageTypechecker)) {
                inlines[name] = enumNameSymbol + "." + name;
            } else {
                inlines[name] = value;
            }
        });
    });

    _.each(model.consts, nsConst => {
        let name = nsConst.name;

        if (inlines[name] === undefined) {
            inlines[name] = nsConst.raw;
        }
    });

    let additionalInlines = options["additional-inlines"];
    if (additionalInlines) {
        for (let key in additionalInlines) {
            if (additionalInlines.hasOwnProperty(key)) {
                inlines[key] = JSON.stringify(additionalInlines[key]);
            }
        }
    }

    this._inlines = inlines;
    this._squeeze = options["squeeze"] && (language != LanguageTypechecker);
}


generate()
{
    let traverser = new Traverser(this._file.ast);

    let model    = this._model;
    let modifier = this._modifier;
    let language = this._language;
    let options  = this._options;
    let inlines  = this._inlines;

    let currentClass;
    let currentMethodNode;

    let optionWarnGlobalNoType        = options["warn-global-no-type"];
    let optionWarnThisInMethods       = options["warn-this-in-methods"];
    let optionWarnSelfInNonMethod     = options["warn-self-in-non-methods"];
    let optionWarnUnknownIvars        = options["warn-unknown-ivars"];
    let optionWarnUnknownSelectors    = options["warn-unknown-selectors"];
    let optionWarnUnusedPrivates      = options["warn-unused-privates"];

    let optionSqueeze = this._squeeze;
    let symbolTyper   = model.getSymbolTyper();

    let knownSelectors = optionWarnUnknownSelectors ? model.selectors : null;

    let usedIvarMap = null;
    let assignedIvarMap = null;

    let usesSimpleIvars = !optionSqueeze && (language !== LanguageTypechecker);

    let warnings = [ ];

    function getCurrentMethodInModel() {
        if (!currentClass || !currentMethodNode) return null;

        let selectorType = currentMethodNode.selectorType;
        let selectorName = currentMethodNode.selectorName;

        if (selectorType == "+") {
            return currentClass.getClassMethodWithName(selectorName);
        } else {
            return currentClass.getInstanceMethodWithName(selectorName);
        }
    }

    function generateThisIvar(ivarName, useSelf)
    {
        let symbol = usesSimpleIvars ? ivarName : symbolTyper.getSymbolForIvarName(ivarName);

        return (useSelf ? "self" : "this") + "." + symbol;
    }

    function generateIvarAssignments(nsClass)
    {
        let booleanIvars = [ ];
        let numericIvars = [ ];
        let objectIvars  = [ ];

        let properties = nsClass.getAllProperties();

        for (let i = 0, length = properties.length; i < length; i++) {
            let property = properties[i];

            if (property.needsBacking) {
                let ivar = property.ivar;

                if (model.isNumericType(property.type)) {
                    numericIvars.push(ivar);
                } else if (model.isBooleanType(property.type)) {
                    booleanIvars.push(ivar);
                } else {
                    objectIvars.push(ivar);
                }
            }
        }

        numericIvars.sort();
        booleanIvars.sort();
        objectIvars.sort();

        let result = "";

        if (objectIvars.length) {
            for (let i = 0, length = objectIvars.length; i < length; i++) {
                result += generateThisIvar(objectIvars[i]) + "="
            }

            result += "null;"
        }

        if (numericIvars.length) {
            for (let i = 0, length = numericIvars.length; i < length; i++) {
                result += generateThisIvar(numericIvars[i]) + "="
            }

            result += "0;"
        }

        if (booleanIvars.length) {
            for (let i = 0, length = booleanIvars.length; i < length; i++) {
                result += generateThisIvar(booleanIvars[i]) + "="
            }

            result += "false;"
        }

        return result;
    }

    function checkIvarAccess(node)
    {
        if (!currentClass.isIvar(node.name, false)) {
            Utils.throwError(
                NSError.CannotUseInstanceVariable,
                `Use of instance variable "${node.name}" declared by superclass`,
                node
            );
        }
    }

    function checkRestrictedUsage(node)
    {
        let name = node.name;

        if (!node.ns_transformable) return;

        if (currentMethodNode && currentClass) {
            if (currentClass.isIvar(name, true)) {
                Utils.throwError(NSError.RestrictedUsage, `Cannot use instance variable "${name}" here`, node);
            }
        }

        if (inlines[name] || model.globals[name]) {
            Utils.throwError(NSError.RestrictedUsage, `Cannot use compiler-inlined "${name}" here`, node);
        }
    }

    function handleNSMessageExpression(node, parent)
    {
        let receiver   = node.receiver.value;
        let methodName = symbolTyper.getSymbolForSelectorName(node.selectorName);

        let firstSelector, lastSelector;

        if (knownSelectors && !knownSelectors[node.selectorName]) {
            warnings.push(Utils.makeError(NSWarning.UnknownSelector, `Use of unknown selector "${node.selectorName}"`, node));
        }

        function replaceMessageSelectors()
        {
            for (let i = 0, length = node.messageSelectors.length; i < length; i++) {
                let messageSelector = node.messageSelectors[i];

                if (!firstSelector) {
                    firstSelector = messageSelector;
                }

                if (messageSelector.arguments) {
                    let lastArgument = messageSelector.arguments[messageSelector.arguments.length - 1];

                    modifier.from(messageSelector).to(messageSelector.arguments[0]).replace("[");
                    modifier.after(lastArgument).insert("]");

                    lastSelector = lastArgument;

                } else if (messageSelector.argument) {
                    modifier.from(messageSelector).to(messageSelector.argument).remove();
                    lastSelector = messageSelector.argument;

                    if (i < (length - 1)) {
                        let nextSelector = node.messageSelectors[i+1];
                        modifier.from(messageSelector.argument).to(nextSelector).replace(",");
                    }

                } else {
                    modifier.select(messageSelector).remove()
                    lastSelector = messageSelector;
                    messageSelector.ns_skip = true;
                }
            }        
        }

        function doCommonReplacement(start, end) {
            replaceMessageSelectors();

            node.receiver.ns_skip = true;

            modifier.from(node).to(firstSelector).replace(start);
            modifier.from(lastSelector).to(node).replace(end);
        }

        function getNullishSuffix() {
            let parentType = parent.type;

            let result = (
                language === LanguageTypechecker ||

                parentType == Syntax.NSMessageExpression ||
                parentType == Syntax.NSMessageReceiver   ||
                parentType == Syntax.ExpressionStatement ||
                parentType == Syntax.LogicalExpression   ||
                parentType == Syntax.IfStatement         ||
                parentType == Syntax.DoWhileStatement    ||
                parentType == Syntax.WhileStatement      ||

                // ~undefined === ~null, !undefined === !null
                (parentType == Syntax.UnaryExpression && (
                    parent.operator == "!" ||
                    parent.operator == "~" ||
                    parent.operator == "void"
                )) ||

                // Access on either undefined and null will throw "Cannot read properties"
                (parentType == Syntax.MemberExpression && parent.object == node) ||

                (parentType == Syntax.ConditionalExpression && parent.test == node)
            ) ? "" : "??null";

            return result;
        }

        // Optimization cases
        if (receiver.type == Syntax.Identifier && model.classes[receiver.name]) {
            let classVariable = symbolTyper.getSymbolForClassName(receiver.name);

            if (language === LanguageEcmascript5) {
                classVariable = NSRootWithClassPrefix + classVariable;
            }

            if (methodName == "alloc") {
                node.receiver.ns_skip = true;
                modifier.select(node).replace("new " + classVariable + "()");

            } else if (methodName == "class") {
                doCommonReplacement(classVariable);

            } else {
                doCommonReplacement(classVariable + "." + methodName + "(", ")");
            }

        } else if (receiver.type == Syntax.Identifier && currentMethodNode) {
            let usesSelf   = (currentMethodNode?.ns_needs_var_self) || (language === LanguageTypechecker);
            let selfOrThis = usesSelf ? "self" : "this";

            if (receiver.name == "super") {
                if (language === LanguageEcmascript5) {
                    doCommonReplacement(`super.${methodName}(`, ")");

                } else if (language === LanguageTypechecker) {
                    let method = getCurrentMethodInModel();
                    let cast = "";

                    if (method.returnType == "instancetype") {
                        cast = "<" + symbolTyper.toTypecheckerType(currentClass.name) + ">";
                    }

                    doCommonReplacement(cast + selfOrThis + "." + NSSuperVariable + "()." + methodName + "(", ")");
                }

            } else if (receiver.name == "self") {
                doCommonReplacement(selfOrThis + "." + methodName + "(", ")");

            } else if (currentClass.isIvar(receiver.name, true)) {
                checkIvarAccess(receiver);

                let ivar = generateThisIvar(receiver.name, usesSelf);
                let nullish = getNullishSuffix();

                doCommonReplacement(`((${ivar}?.${methodName}(`, `))${nullish})`);

                usedIvarMap[receiver.name] = true;

            } else {
                let nullish = getNullishSuffix();
                doCommonReplacement(`((${receiver.name}?.${methodName}(`, `))${nullish})`);
            }

        } else {
            replaceMessageSelectors();

            if (receiver.ns_nonnull) {
                modifier.from(node).to(receiver).replace("((");
                modifier.from(receiver).to(firstSelector).replace(`).${methodName}(`);
                modifier.from(lastSelector).to(node).replace(`))`);

            } else {
                let nullish = getNullishSuffix();

                modifier.from(node).to(receiver).replace("(((");
                modifier.from(receiver).to(firstSelector).replace(`)?.${methodName}(`);
                modifier.from(lastSelector).to(node).replace(`))${nullish})`);
            }
        }
    }

    function handleNSClassImplementation(node)
    {
        let name = node.id.name;
        let cls  = model.classes[name];

        let superName   = cls.superclass ? cls.superclass.name : null;
        let classSymbol = symbolTyper.getSymbolForClassName(name);
 
        // Only allow whitelisted children inside of an implementation block
        _.each(node.body.body, child => {
            let type = child.type;
            
            if (type !== Syntax.NSMethodDefinition && type !== Syntax.NSPropertyDirective) {
                Utils.throwError(NSError.ParseError, 'Unexpected implementation child.', child);
            }

            if (type === Syntax.VariableDeclaration) {
                _.each(child.declarations, declarator => {
                    if (declarator.init) {
                        if (declarator.init.type !== Syntax.Literal &&
                            declarator.init.type !== Syntax.FunctionExpression)
                        {
                            Utils.throwError(NSError.ParseError, 'Variable declaration must be initialized to a constant.', declarator.init);
                        }
                    }
                });
            }
        });

        let startText;
        let endText;

        if (language === LanguageEcmascript5) {
            let extendsString = NSRootWithClassPrefix +
                (superName ? symbolTyper.getSymbolForClassName(superName) : "N$_base");

            let constructorSetIvars = generateIvarAssignments(currentClass);

            startText = `${NSRootWithClassPrefix}${classSymbol} = class ${classSymbol} extends ${extendsString} {`;

            if (constructorSetIvars) {
                startText += `constructor () { super(); ${constructorSetIvars} }`;
            }

            endText = "};";

        } else if (language === LanguageTypechecker) {
            startText = "(function() { ";
            endText = "});";
        }

        if (!node.ivarDeclarations && !node.body.body.length) {
            modifier.select(node).replace(startText + endText);

        } else {
            modifier.from(node).to(node.ivarDeclarations || node.body).replace(startText);
            modifier.from(node.body).to(node).replace(endText);
        }
    }

    function handleMethodDefinition(node)
    {
        let methodName = symbolTyper.getSymbolForSelectorName(node.selectorName);
        let isClassMethod = node.selectorType == "+";
        let args = [ ];

        if (Utils.isReservedSelectorName(node.selectorName)) {
            Utils.throwError(
                NSError.ReservedMethodName,
                `The method name "${node.selectorName}" is reserved by the runtime and may not be overridden`,
                node
            );
        }

        if (language === LanguageTypechecker) {
            args.push("self" + " : " + symbolTyper.getSymbolForClassName(currentClass.name, isClassMethod) );
        }

        for (let i = 0, length = node.methodSelectors.length; i < length; i++) {
            let variableName = node.methodSelectors[i].variableName;
            let methodType   = node.methodSelectors[i].methodType;

            if (variableName) {
                checkRestrictedUsage(variableName);

                let name = variableName.name;

                if (language === LanguageEcmascript5) {
                    args.push(name);
                } else if (language === LanguageTypechecker) {
                    let outputType = symbolTyper.toTypecheckerType(methodType && methodType.value);
                    args.push(name + (methodType ? (" : " + outputType) : ""));
                }
            }
        }

        if (language == LanguageEcmascript5) {
            let definition = (isClassMethod ? "static " : "") + methodName + "(" + args.join(", ") + ") ";

            modifier.from(node).to(node.body).replace(definition);
            modifier.from(node.body).to(node).replace("");

        } else if (language === LanguageTypechecker) {
            let definition = "(function(" + args.join(", ") + ") ";

            let returnType = getCurrentMethodInModel().returnType;
            if (returnType == "instancetype") returnType = currentClass.name;
            definition += ": " + symbolTyper.toTypecheckerType(returnType);

            modifier.from(node).to(node.body).replace(definition);
            modifier.from(node.body).to(node).replace(");");
        }
    }

    function handleLiteral(node)
    {
        let replacement;

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

    function handleNSPredefinedMacro(node)
    {
        let name = node.name;

        let className    = currentClass      ? currentClass.name              : null;
        let selectorName = currentMethodNode ? currentMethodNode.selectorName : null;
        
        if (optionSqueeze) {
            className    = className    && symbolTyper.getSymbolForClassName(className);
            selectorName = selectorName && symbolTyper.getSymbolForSelectorName(selectorName);
        }

        if (name === "@CLASS") {
            if (currentClass) {
                modifier.select(node).replace('"' + className + '"');
            } else {
                Utils.throwError(NSError.ParseError, 'Cannot use @CLASS outside of a class implementation');
            }

        } else if (name === "@SEL" || name === "@FUNCTION" || name === "@ARGS" || name === "@FUNCTION_ARGS") {
            let currentMethod = getCurrentMethodInModel();
            let replacement   = null;

            if (className && selectorName && currentMethodNode && currentMethod) {
                let selectorType   = currentMethodNode.selectorType;
                let functionString = `${selectorType}[${className} ${selectorName}]`;
                let argsString     = "[" + (currentMethod.variableNames || [ ]).join(",") + "]";

                if (name === "@SEL") {
                    replacement = '"' + selectorName + '"';
                } else if (name === "@FUNCTION") {
                    replacement = '"' + functionString + '"';

                } else if (name === "@FUNCTION_ARGS") {
                    replacement = '"' + functionString + ' " + ' + argsString;

                } else if (name === "@ARGS") {
                    replacement = argsString;
                }
            }

            if (replacement) {
                modifier.select(node).replace(replacement);
            } else {
                Utils.throwError(NSError.ParseError, `Cannot use "${name}" outside of a method definition`);
            }

        } else {
            Utils.throwError(NSError.ParseError, `Unknown identifier: "${name}"`);
        }
    }

    function handleNSTypeDefinition(node)
    {
        if (language === LanguageTypechecker) {
            let typesToCheck = [ ];

            _.each(node.params, param => {
                typesToCheck.push( symbolTyper.toTypecheckerType(param.annotation.value) );
            });

            if (node.annotation) {
                typesToCheck.push( symbolTyper.toTypecheckerType(node.annotation.value) );
            }

            // Lay down a cast operation with all needed types.  This will generate a warning due to an unknown type.  
            modifier.select(node).replace("<[ " + typesToCheck.join(", ") + "]> null;");

        } else {
            modifier.select(node).remove();
        }
    }


    function handleIdentifier(node, parent)
    {
        let name   = node.name;
        let isSelf = (name == "self");

        if (name[0] === "N" && name[1] === "$") {
            Utils.throwError(NSError.ReservedIdentifier, `Identifiers may not start with "N$"`, node);

        } else if (name[0] === "@") {
            handleNSPredefinedMacro(node);
            return;
        }

        if (!node.ns_transformable) return;

        let nsGlobal = model.globals[name];
        let replacement;

        if (nsGlobal) {
            replacement = NSRootWithGlobalPrefix + (optionSqueeze ? symbolTyper.getSymbolForIdentifierName(name) : name);

            modifier.select(node).replace(replacement);
            return;

        } else if (currentMethodNode && currentClass) {
            if (currentClass.isIvar(name, true) || name == "self") {
                if (name != "self") {
                    checkIvarAccess(node);
                }

                let usesSelf = (currentMethodNode.ns_needs_var_self) || (language === LanguageTypechecker);

                if (isSelf) {
                    replacement = usesSelf ? "self" : "this";
                } else {
                    replacement = generateThisIvar(name, usesSelf);
                    usedIvarMap[name] = true;

                    if (parent.type === Syntax.AssignmentExpression && 
                        parent.left.name == name)
                    {
                        assignedIvarMap[name] = true;
                    }
                }

                modifier.select(node).replace(replacement);
                return;

            } else {
                if (name[0] == "_" && optionWarnUnknownIvars && (name.length > 1)) {
                    warnings.push(Utils.makeError(NSWarning.UndeclaredInstanceVariable, `Use of undeclared instance variable "${node.name}"`, node));
                }
            } 

        } else if (isSelf && optionWarnSelfInNonMethod && !currentMethodNode) {
            warnings.push(Utils.makeError(NSWarning.UseOfSelfInNonMethod, `Use of "self" in non-method`, node));
        }

        if (inlines) {
            let result = inlines[name];
            if (result !== undefined) {
                if (inlines.hasOwnProperty(name)) {
                    modifier.select(node).replace("" + result);
                    return;
                }
            }
        }

        if (optionSqueeze) {
            let result = symbolTyper.getSymbolForIdentifierName(name);
            if (result !== undefined) {
                modifier.select(node).replace("" + result);
                return;
            }
        }
    }

    function handleVariableDeclaration(node, parent)
    {
        for (let declaration of node.declarations) {
            checkRestrictedUsage(declaration.id);
        }
    }

    function handleNSPropertyDirective(node)
    {
        let name = node.id.name;

        let property = currentClass.getPropertyWithName(name);
        let ivar = generateThisIvar(property.ivar, false);

        let getterMethod = currentClass.getInstanceMethodWithName(property.getter?.name);
        let setterMethod = currentClass.getInstanceMethodWithName(property.setter?.name);

        let result = "";
        if (setterMethod?.synthesized) {
            if (language === LanguageEcmascript5) {
                let changeName = property.setter.change;

                let s = [ ];

                if (changeName) {
                    s.push(`if (${ivar} !== arg) {`);
                }

                if (property.setter.copies) {
                    s.push(`${ivar} = ${NSRootVariable}.makeCopy(arg);`);
                } else {
                    s.push(`${ivar} = arg;`);
                }

                if (changeName) {
                    s.push(`this.${symbolTyper.getSymbolForSelectorName(changeName)}();`);
                    s.push(`}`);
                }

                let symbol = symbolTyper.getSymbolForSelectorName(property.setter.name);

                result += `${symbol}(arg) {${s.join(" ")} } `; 
            }
        }

        if (getterMethod?.synthesized) {
            if (language === LanguageEcmascript5) {
                result += symbolTyper.getSymbolForSelectorName(property.getter.name);

                if (property.getter.copies) {
                    result += `() { return ${NSRootVariable}.makeCopy(${ivar}); } `;
                } else {
                    result += `() { return ${ivar}; } `;
                }
            }
        }

        if (language === LanguageTypechecker) {
            result += "<" + symbolTyper.toTypecheckerType(property.type) + "> null;";
        }

        if (!result) {
            modifier.select(node).remove();
        } else {
            modifier.select(node).replace(result);
        }
    }

    function handleNSSelectorDirective(node)
    {
        let name = symbolTyper.getSymbolForSelectorName(node.name);

        if (knownSelectors && !knownSelectors[node.name]) {
            warnings.push(Utils.makeError(NSWarning.UnknownSelector, `Use of unknown selector "${node.name}"`, node));
        }

        modifier.select(node).replace(
            language === LanguageTypechecker ? `{ N$_Selector: "${name}" }` : `"${name}"`
        );
    }

    function handleNSEnumDeclaration(node)
    {
        let length = node.declarations ? node.declarations.length : 0;
        let last   = node;

        if (length) {
            let firstDeclaration = node.declarations[0];
            let lastDeclaration  = node.declarations[length - 1];

            for (let i = 0; i < length; i++) {
                let declaration = node.declarations[i];

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

    function handleNSConstDeclaration(node)
    {
        let length = node.declarations ? node.declarations.length : 0;
        let values = [ ];

        if (length) {
            let firstDeclaration = node.declarations[0];
            modifier.from(node).to(firstDeclaration.id).replace("var ");

        } else {
            modifier.select(node).remove();
        }
    }

    function handleNSCastExpression(node)
    {
        let before = "(";
        let after  = ")";

        if (language == LanguageTypechecker) {
            before = "(<" + symbolTyper.toTypecheckerType(node.id.name) + ">(<any>(";
            after  = ")))";
        }

        modifier.from(node).to(node.argument).replace(before);
        modifier.from(node.argument).to(node).replace(after);
    }

    function handleNSAnyExpression(node)
    {
        let before = (language == LanguageTypechecker) ? "(<any>(" : "(";
        let after  = (language == LanguageTypechecker) ? "))"      : ")";

        modifier.from(node).to(node.argument).replace(before);
        modifier.from(node.argument).to(node).replace(after);
    }

    function handleNSTypeAnnotation(node, parent)
    {
        if (language === LanguageTypechecker) {
            let inValue  = node.value;
            let outValue = symbolTyper.toTypecheckerType(inValue);

            if (inValue != outValue) {
                modifier.select(node).replace(": " + outValue);
            }

        } else {
            modifier.select(node).remove();
        }
    }

    function handleNSGlobalDeclaration(node)
    {
        let declaration = node.declaration;
        let declarators = node.declarators;

        if (optionWarnGlobalNoType) {
            let allTyped;

            if (declaration) {
                allTyped = !!declaration.annotation && _.every(declaration.params, param => !!param.annotation);

            } else if (declarators) {
                allTyped = _.every(declarators, declarator => !!declarator.id.annotation);
            }

            if (!allTyped) {
                warnings.push(Utils.makeError(NSWarning.MissingTypeAnnotation, "Missing type annotation on @global", node));
            }
        }

        if (language !== LanguageTypechecker) {
            if (declaration) {
                let name = symbolTyper.getSymbolForIdentifierName(declaration.id.name);

                modifier.from(node).to(declaration).replace(NSRootWithGlobalPrefix + name + "=");
                modifier.select(declaration.id).remove();
                declaration.id.ns_skip = true;

            } else if (declarators) {
                modifier.from(node).to(declarators[0]).remove();

                _.each(declarators, declarator => {
                    let name = symbolTyper.getSymbolForIdentifierName(declarator.id.name);

                    modifier.select(declarator.id).replace(NSRootWithGlobalPrefix + name);
                    declarator.id.ns_skip = true;
                })
            }

        } else {
            if (declaration) {
                modifier.from(node).to(declaration.id).replace("(function ");
                modifier.select(declaration.id).remove();
                modifier.after(node).insert(");");

                declaration.id.ns_skip = true;

            } else if (declarators) {
                modifier.from(node).to(declarators[0]).replace("(function() { var ");
                modifier.after(node).insert("});");

                let index = 0;
                _.each(declarators, function(declarator) {
                    modifier.select(declarator.id).replace("a" + index++);
                    declarator.id.ns_skip = true;
                });
            }
        }
    }

    function handleFunctionDeclarationOrExpression(node)
    {
        _.each(node.params, param => {
            checkRestrictedUsage(param);
        });
    }

    function handleProperty(node) 
    {
        let key = node.key;

        if (node.computed && (key.type === Syntax.Identifier)) {
            let nsConst = model.consts[key.name];

            if (nsConst && _.isString(nsConst.value)) {
                modifier.from(node).to(node.value).replace(nsConst.raw + ":");
                modifier.from(node.value).to(node).replace("");
                key.ns_skip = true;
            }
        }
    }

    function addSelfToMethodNode(methodNode)
    {
        let body = methodNode.body.body;

        if ((language !== LanguageTypechecker) && body.length) {
            modifier.before(body[0]).insert("let self = this;");
        }
    }

    function checkThis(thisNode, path)
    {
        for (let i = path.length - 1; i >= 0; i--) {
            let node = path[i];

            if (node.type == Syntax.NSMethodDefinition ||
                node.type == Syntax.NSClassImplementation ||
                node.type == Syntax.NSMessageExpression)
            {
                warnings.push(Utils.makeError(NSWarning.UseOfThisInMethod, "Use of 'this' keyword in NilScript method definition", thisNode));

            } else if (node.type == Syntax.FunctionDeclaration ||
                       node.type == Syntax.FunctionExpression  ||
                       node.type == Syntax.ArrowFunctionExpression) {
                break;
            }
        }
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        if (node.ns_skip) return Traverser.SkipNode;

        if (type === Syntax.NSProtocolDefinition ||
            type === Syntax.NSEnumDeclaration    ||
            type === Syntax.NSConstDeclaration
        ) {
            modifier.select(node).remove();
            return Traverser.SkipNode;

        } else if (type === Syntax.NSBridgedDeclaration) {
            modifier.from(node).to(node.declaration).remove();

        } else if (type === Syntax.NSClassImplementation) {
            currentClass = model.classes[node.id.name];

            _.each(currentClass.prepareWarnings, warning => {
                warnings.push(warning);
            });

            usedIvarMap = { };
            assignedIvarMap = { }

            handleNSClassImplementation(node);

        } else if (type === Syntax.NSMethodDefinition) {
            currentMethodNode = node;
            handleMethodDefinition(node);

        } else if (type === Syntax.NSMessageExpression) {
            handleNSMessageExpression(node, parent);

        } else if (type === Syntax.NSPropertyDirective) {
            handleNSPropertyDirective(node);
            return Traverser.SkipNode;

        } else if (type === Syntax.NSSelectorDirective) {
            handleNSSelectorDirective(node);

        } else if (type === Syntax.NSEnumDeclaration) {
            handleNSEnumDeclaration(node);

        } else if (type === Syntax.NSConstDeclaration) {
            handleNSConstDeclaration(node);

        } else if (type === Syntax.NSCastExpression) {
            handleNSCastExpression(node);

        } else if (type === Syntax.NSAnyExpression) {
            handleNSAnyExpression(node);

        } else if (type === Syntax.NSTypeAnnotation) {
            handleNSTypeAnnotation(node, parent);

        } else if (type === Syntax.NSGlobalDeclaration) {
            handleNSGlobalDeclaration(node);

        } else if (type === Syntax.NSPredefinedMacro) {
            handleNSPredefinedMacro(node);

        } else if (type === Syntax.NSTypeDefinition) {
            handleNSTypeDefinition(node);

        } else if (type === Syntax.Literal) {
            handleLiteral(node);

        } else if (type === Syntax.Identifier) {
            handleIdentifier(node, parent);

        } else if (type === Syntax.VariableDeclaration) {
            handleVariableDeclaration(node);

        } else if (type === Syntax.ThisExpression) {
            if (optionWarnThisInMethods) {
                checkThis(node, traverser.getParents());
            }

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression || type === Syntax.ArrowFunctionExpression) {
            handleFunctionDeclarationOrExpression(node);

        } else if (type === Syntax.Property) {
            handleProperty(node);
        }

    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.NSClassImplementation) {
            if (optionWarnUnusedPrivates) {
                _.each(currentClass.getAllProperties(), property => {
                    let { name, location, ivar, getter, setter } = property;

                    if (getter || setter) return;

                    if (!usedIvarMap[ivar]) {
                        warnings.push(Utils.makeError(NSWarning.UnusedPrivateProperty, `Unused private property "${name}"`, location));

                    } else if (!assignedIvarMap[ivar]) {
                        warnings.push(Utils.makeError(NSWarning.UnassignedPrivateProperty, `Private property "${name}" used but never assigned`, location));
                    }
                });
            }

            currentClass = null;

        } else if (type === Syntax.NSMethodDefinition) {
            if (currentMethodNode.ns_needs_var_self) {
                addSelfToMethodNode(currentMethodNode);
            }

            currentMethodNode = null;
        }
    });

    let path = this._file.path;

    _.each(warnings, warning => {
        Utils.addFilePathToError(path, warning);
    });

    return {
        lines: this._modifier.finish(),
        warnings: warnings
    };
}

}
