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

    let currentNXClass;
    let currentClass;
    let currentMethodNode;

    let optionWarnGlobalNoType        = options["warn-global-no-type"];
    let optionWarnUnknownSelectors    = options["warn-unknown-selectors"];

    let optionSqueeze = this._squeeze;
    let symbolTyper   = model.getSymbolTyper();

    let knownSelectors = optionWarnUnknownSelectors ? model.selectors : null;

    let usedIvarMap = null;

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

    function generateIvar(ivarName)
    {
        return usesSimpleIvars ? ivarName : symbolTyper.getSymbolForIvarName(ivarName);
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

        function doCommonReplacement(start, end, needsGroup) {
            replaceMessageSelectors();

            node.receiver.ns_skip = true;
            
            if (needsGroup) { start = `(${start}`; end = `${end})`; }

            modifier.from(node).to(firstSelector).replace(start);
            modifier.from(lastSelector).to(node).replace(end);
        }

        // Optimization cases

        if (receiver.type == Syntax.ThisExpression) {
            doCommonReplacement("this." + methodName + "(", ")");

        } else if (receiver.type == Syntax.Identifier && model.classes[receiver.name]) {
            let classVariable = symbolTyper.getSymbolForClassName(receiver.name);

            if (language === LanguageEcmascript5) {
                classVariable = NSRootWithClassPrefix + classVariable;
            }

            if (methodName == "alloc") {
                doCommonReplacement("new " + classVariable + "()");

            } else if (methodName == "class") {
                doCommonReplacement(classVariable);

            } else {
                doCommonReplacement(classVariable + "." + methodName + "(", ")");
            }

        } else if (receiver.type == Syntax.Identifier && currentMethodNode) {
            if (receiver.name == "super") {
                if (!currentClass.superclass) {
                    warnings.push(Utils.makeError(NSWarning.UndeclaredInstanceVariable, `NO SUPERCLASS`, node));
                }
            
                if (language === LanguageEcmascript5) {
                    doCommonReplacement(`super.${methodName}(`, ")");

                } else if (language === LanguageTypechecker) {
                    let method = getCurrentMethodInModel();
                    let cast = "";

                    if (method.returnType == "instancetype") {
                        cast = "<" + symbolTyper.toTypecheckerType(currentClass.name) + ">";
                    }

                    doCommonReplacement(cast + "this." + NSSuperVariable + "()." + methodName + "(", ")");
                }

            } else {
                let needsGroup = parent.type == Syntax.MemberExpression; 
                doCommonReplacement(`${receiver.name}?.${methodName}(`, `)`, needsGroup);
            }

        } else {
            replaceMessageSelectors();

            let start = "";
            let end   = ")";
            let afterReceiver = receiver.ns_nonnull ? "" : "?";

            if (parent.type == Syntax.MemberExpression) {
                start += "(";
                end   += ")";
            }
            
            if (
                receiver.type != Syntax.Identifier &&
                receiver.type != Syntax.MemberExpression &&
                receiver.type != Syntax.CallExpression &&
                receiver.type != Syntax.NSMessageExpression
            ) {
                start += "(";
                afterReceiver = ")" + afterReceiver;
            }

            modifier.from(node).to(receiver).replace(start);
            modifier.from(receiver).to(firstSelector).replace(`${afterReceiver}.${methodName}(`);
            modifier.from(lastSelector).to(node).replace(end);
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

            startText = `${NSRootWithClassPrefix}${classSymbol} = class ${classSymbol} extends ${extendsString} {`;

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
            args.push("this" + " : " + symbolTyper.getSymbolForClassName(currentClass.name, isClassMethod) );
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
            if (returnType == "instancetype" || returnType == "init") returnType = currentClass.name;
            definition += ": " + symbolTyper.toTypecheckerType(returnType);

            modifier.from(node).to(node.body).replace(definition);
            modifier.from(node.body).to(node).replace(");");
        }

        let returnType = getCurrentMethodInModel().returnType;

        if (returnType == "init") {
            let length = node.body.body.length;
            if (length > 0) {
                modifier.from(node.body.body[length - 1]).to(node.body).replace("return this; }");
            } else {
                modifier.select(node.body).replace("{ return this; }");
            }
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
        let name = node.name;

        if (name == "self") {
            warnings.push(Utils.makeError(NSWarning.UseOfSelfInNonMethod, `Use of "self"`, node));
        }

        if (name[0] === "N" && name[1] === "$") {
            Utils.throwError(NSError.ReservedIdentifier, `Identifiers may not start with "N$"`, node);

        } else if (name[0] === "@") {
            handleNSPredefinedMacro(node);
            return;
        }


        if (
            currentMethodNode &&
            currentClass &&
            currentClass.isIvar(name, true) &&
            parent.type == Syntax.MemberExpression &&
            parent.computed == false &&
            parent.object.type == Syntax.ThisExpression
        ) {
            usedIvarMap[name] = true;
            modifier.select(node).replace(generateIvar(name));
            return;
        }

        if (!node.ns_transformable) return;

        let nsGlobal = model.globals[name];
        let replacement;

        if (nsGlobal) {
            replacement = NSRootWithGlobalPrefix + (optionSqueeze ? symbolTyper.getSymbolForIdentifierName(name) : name);

            modifier.select(node).replace(replacement);
            return;
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

    function handleMemberExpression(node, parent)
    {
        if (node.computed ||
            node.object.type !== Syntax.Identifier ||
            !model.enums[node.object.name]
        ) {
            return;
        }
        
        if (node.property.type !== Syntax.Identifier) {
            warnings.push(Utils.makeError(NSWarning.UnknownEnumMember, `enum member must be an identifier`, node));
            return;
        }

        let nsEnum = model.enums[node.object.name];
        let memberName = node.property.name;
        let member = nsEnum.members.get(memberName);

        if (member) {
            node.object.ns_skip = true;
            node.property.ns_skip = true;

            let replacement;
            if (language == LanguageTypechecker) {
                let enumNameSymbol = symbolTyper.getSymbolForEnumName(nsEnum.name);
                replacement = enumNameSymbol + "." + member.name;
            } else {
                replacement = "" + member.value;
            }
            
            modifier.select(node).replace(replacement);

        } else {
            warnings.push(
                Utils.makeError(NSWarning.UnknownEnumMember, `Unknown enum member '${memberName}`, node.property)
            );
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
        let ivar = generateIvar(property.ivar);

        let getterMethod = currentClass.getInstanceMethodWithName(property.getter?.name);
        let setterMethod = currentClass.getInstanceMethodWithName(property.setter?.name);

        let result = "";
        if (setterMethod?.synthesized) {
            if (language === LanguageEcmascript5) {
                let changeName = property.setter.change;

                let s = [ ];

                if (changeName) {
                    s.push(`if (this.${ivar} !== arg) {`);
                }

                s.push(`this.${ivar} = arg;`);

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
                result += `() { return this.${ivar}; } `;
            }
        }

        if (language === LanguageTypechecker) {
            result += "<" + symbolTyper.toTypecheckerType(property.type) + "> null;";
        } else {
            let initValue;
            if (model.isNumericType(property.type)) {
                initValue = "0";
            } else if (model.isBooleanType(property.type)) {
                initValue = "false";
            } else {
                initValue = "null";
            }

            result += `${ivar} = ${initValue}`;
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
    
    function handleNXPropDefinition(node)
    {
        let name = node.key.name;
        
        let hasField =  currentNXClass.hasField("_" + name);
        let hasGetter = currentNXClass.hasGetter(name);
        let hasSetter = currentNXClass.hasSetter(name);
        
        let replacement = "";
        if (!hasField) {
            replacement += `_${name};`;
        }

        if (!hasGetter) {
            replacement += `get ${name}() { return this._${name}; }`;
        }

        if (!node.isReadonly && !hasSetter) {
            replacement += `set ${name}(x) { this._${name} = x; }`;
        }

        modifier.select(node).replace(replacement);
        node.annotation.ns_skip = true;
    }

    function handleNXFuncDefinition(node)
    {
        let isStatic = node.static;

        let replacement = node.key.name;

        for (let param of node.params) {
            let label = param.label?.name;
            if (!label) label = param.name.name;
            replacement += "_" + label;
        }
        
        modifier.from(node).to(node.key).replace(isStatic ? "static " : "");
        modifier.select(node.key).replace(replacement);
    }

    function handleNXFuncParameter(node)
    {
        if (node.label) {
            modifier.select(node.label).remove();
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

        } else if (type === Syntax.Identifier) {
            handleIdentifier(node, parent);

        } else if (type === Syntax.MemberExpression) {
            handleMemberExpression(node, parent);

        } else if (type === Syntax.VariableDeclaration) {
            handleVariableDeclaration(node);

        } else if (type === Syntax.FunctionDeclaration || type === Syntax.FunctionExpression || type === Syntax.ArrowFunctionExpression) {
            handleFunctionDeclarationOrExpression(node);

        } else if (type === Syntax.Property) {
            handleProperty(node);

        } else if (type === Syntax.NXClassDeclaration) {
            console.log(node);
            currentNXClass = node.nxClass;

        } else if (type === Syntax.NXPropDefinition) {
            handleNXPropDefinition(node);
        } else if (type === Syntax.NXFuncDefinition) {
            handleNXFuncDefinition(node);
        } else if (type === Syntax.NXFuncParameter) {
            handleNXFuncParameter(node);
        }

        
    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.NSClassImplementation) {
            currentClass = null;

        } else if (type === Syntax.NSMethodDefinition) {
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
