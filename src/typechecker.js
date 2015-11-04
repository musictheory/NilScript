/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var fs      = require("fs");
var cp      = require("child_process");
var path    = require("path");
var dirname = require("path").dirname;
var _       = require("lodash");
var ts      = require("typescript");


var sBlacklistCodes  = [ 2417 ];

// See https://github.com/Microsoft/TypeScript/blob/master/src/compiler/diagnosticMessages.json
var sReasonTemplates = [
    // 2304: Cannot find name '{0}'.
    { code: 2304, type: "-", text: "Unknown method '{0}'"   },
    { code: 2304, type: "p", text: "Unknown protocol '{0}'" },
    { code: 2304, type: "c", text: "Unknown class '{0}'"    },
    { code: 2304,            text: "Unknown identifier '{0}'" },

    // 2339: Property '{0}' does not exist on type '{1}'.
    { code: 2339, type: "+", text: "No known class method: +[{1} {0}]"    },
    { code: 2339, type: "-", text: "No known instance method: -[{1} {0}]" },

    // 2415: Class '{0}' incorrectly extends base class '{1}'.
    // Types of property 'buildElements' are incompatible.
    { code: 2415, text: "'{2415:0}' and '{2415:1}' have incompatible method '{2326:0}'" },

    // 2420: Class '{0}' incorrectly implements interface '{1}'.
    // 2324: Property '{0}' is missing in type '{1}'.
    { code: 2420, text: "Method '{2324:0}' in protocol '{2420:1}' not implemented" }
];


var sReasonTemplateMap;

function getReasonTemplate(code, sawClass, sawProtocol, sawMethod, sawStatic) {
    var types = [ ];

    if (sawMethod)   types.push(sawStatic ? "+" : "-");
    if (sawClass)    types.push("c");
    if (sawProtocol) types.push("p");
    var type = sawMethod ? (sawStatic ? "+" : "-") : "";

    types.push(null);

    if (!sReasonTemplateMap) {
        sReasonTemplateMap = { };

        _.each(sReasonTemplates, function(t) {
            sReasonTemplateMap["" + t.code + (t.type || "")] = t;
        });
    }

    for (var i = 0, length = types.length; i < length; i++) {
        var reason = sReasonTemplateMap["" + code + (types[i] || "")];
        if (reason) return reason;
    }

    return null;
}


/*
    See https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API
*/
var sLibrarySource;

function ts_transform(defs, code, options)
{
    // Eventually, there should be an option/way to switch to "lib.core.d.ts"
    // Keep in sync with: https://github.com/Microsoft/TypeScript/issues/494 ?
    //
    if (!sLibrarySource) {
        sLibrarySource = fs.readFileSync(path.join(path.dirname(require.resolve('typescript')), 'lib.d.ts')).toString();
    }

    var contentMap = { "defs.ts": defs, "lib.d.ts": sLibrarySource, "code.ts": code, };

    var program = ts.createProgram(_.keys(contentMap), options || { }, {
        getSourceFile: function(filename, languageVersion) {
            var content = contentMap[filename];
            return content ? ts.createSourceFile(filename, content, options.target, "0") : undefined;
        },

        writeFile:                 function() { },
        getDefaultLibFileName:     function() { return "lib.d.ts"; },
        useCaseSensitiveFileNames: function() { return false; },
        getCanonicalFileName:      function(filename) { return filename; },
        getCurrentDirectory:       function() { return ""; },
        getNewLine:                function() { return "\n"; }
    });

    var emitResult = program.emit();
    var diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    return diagnostics;
}


function TypeChecker(model, generator, files, noImplicitAny)
{
    var defsResult = this._generateDefs(model);
    this._defs = defsResult.defs;
    this._defsLineMap = defsResult.lines;

    generator.generate();

    var codeResult = generator.finish();
    this._code = codeResult.code;
    this._codeLineMap = codeResult._lines;
    this._prependLineCount = codeResult._prependLineCount;

    this._files = files;
    this._model = model;
    this._noImplicitAny = noImplicitAny;
}


TypeChecker.prototype._generateDefs = function(model)
{
    var symbolTyper = model.getSymbolTyper();

    function makeDeclarationForMethod(method, ojClass) {
        var methodName = symbolTyper.getSymbolForSelectorName(method.selectorName);
        var parameters = [ ];

        for (var i = 0, length = method.parameterTypes.length; i < length; i++) {
            var parameterType = method.parameterTypes[i];
            var variableName  = method.variableNames[i] || ("a" + i);

            if (parameterType == "id") {
                parameterType = "$oj_$id_union"
            } else {
                parameterType = symbolTyper.toTypecheckerType(parameterType);
            }

            parameters.push(variableName + " : " + parameterType);
        }

        var returnType;

        if (method.returnType == "id") {
            returnType = "$oj_$id_intersection";
        } else {
            returnType = symbolTyper.toTypecheckerType(method.returnType, ojClass);
        }

        return methodName + (method.optional ? "?" : "") + "(" + parameters.join(", ") + ") : " + returnType + ";";
    }

    function makeProtocolList(verb, isStatic, rawProtocolNames) {
        var symbols = [ ];

        _.each(rawProtocolNames, function(protocolName) {
            symbols.push( symbolTyper.getSymbolForProtocolName(protocolName, isStatic) );
        });

        if (symbols.length) {
            return " " + verb + " " + symbols.join(",");
        }

        return "";
    }

    function sortMethodIntoDeclarations(ojClass, allMethods, classMethodDeclarations, instanceMethodDeclarations) {
       _.each(allMethods, function(method) {
            var arr = (method.selectorType == "+") ? classMethodDeclarations : instanceMethodDeclarations;
            arr.push(makeDeclarationForMethod(method, ojClass));
        });
    }

    function getInstancetypeMethods(inClass) {
        var declaredMethods = { };
        var toReturn = [ ];
        var ojClass = inClass;

        while (ojClass) {
            var methods = ojClass.getAllMethods();

            _.each(methods, function(m) {
                var name = m.selectorType + m.selectorName;

                if (m.returnType == "instancetype") {
                    if (!declaredMethods[name]) {
                        declaredMethods[name] = true;

                        if (ojClass != inClass) {
                            toReturn.push(m);
                        }
                    }
                }
            });

            ojClass = model.classes[ojClass.superclassName];
        }

        return toReturn;
    }

    function generateEnum(lines, ojEnum) {
        lines.push("enum " + ojEnum.name + " {");

        _.each(ojEnum.values, function(value, name) {
            lines.push(name + " = " + value + ",");
        });

        lines.push("}");
    }

    function generateProtocol(lines, ojProtocol) {
        var protocolName = symbolTyper.getSymbolForProtocolName(ojProtocol.name, false);
        var staticName   = symbolTyper.getSymbolForProtocolName(ojProtocol.name, true);

        var classMethodDeclarations    = [ ];
        var instanceMethodDeclarations = [ ];

        sortMethodIntoDeclarations(null, ojProtocol.getAllMethods(), classMethodDeclarations, instanceMethodDeclarations);

        lines.push("declare interface " + protocolName + makeProtocolList("extends", false, ojProtocol.protocolNames) + " {");

        _.each(instanceMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        lines.push("}");

        lines.push("declare interface " + staticName + makeProtocolList("extends", true, ojProtocol.protocolNames) + " {");

        _.each(classMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        lines.push("}");
    }

    function generateClass(lines, ojClass, classSymbol, staticSymbol) {
        var superSymbol       = ojClass.superclassName ? symbolTyper.getSymbolForClassName(ojClass.superclassName, false) : "$oj_$Base";
        var superStaticSymbol = ojClass.superclassName ? symbolTyper.getSymbolForClassName(ojClass.superclassName, true)  : "$oj_$StaticBase";

        var declareClass = "declare class " + classSymbol +
                           " extends " + superSymbol +
                           makeProtocolList("implements", false, ojClass.protocolNames) +
                           " {";

        lines.push(
            declareClass,
            "static alloc() : " + classSymbol + ";",
            "class() : " + staticSymbol + ";",
            "static class() : " + staticSymbol + ";",
            "init()  : " + classSymbol + ";",
            "$oj_super() : " + superSymbol + ";",
            "static $oj_super() : " + superStaticSymbol + ";"
        );

        var methods = [ ].concat(ojClass.getAllMethods(), getInstancetypeMethods(ojClass));
        var classMethodDeclarations    = [ ];
        var instanceMethodDeclarations = [ ];

        sortMethodIntoDeclarations(ojClass, methods, classMethodDeclarations, instanceMethodDeclarations);

        _.each(classMethodDeclarations, function(decl) {
            lines.push("static " + decl);
        });

        _.each(instanceMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        _.each(ojClass.getAllIvars(), function(ivar) {
            lines.push(symbolTyper.getSymbolForIvar(ivar) + " : " +  symbolTyper.toTypecheckerType(ivar.type) + ";");
        });

        lines.push("}");

        var declareStatic = "declare class " + staticSymbol +
                            " extends " + superStaticSymbol +
                            makeProtocolList("implements", true, ojClass.protocolNames) +
                            " {";

        lines.push(
            declareStatic,
            "alloc() : " + classSymbol  + ";",
            "class() : " + staticSymbol + ";",
            "$oj_super() : " + superStaticSymbol + ";"
        );

        _.each(classMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        lines.push("}");
    }

    var classSymbols  = [ ];
    var staticSymbols = [ ];

    var runtimeContents = fs.readFileSync(dirname(__filename) + "/runtime.d.ts") + "\n";
    var lines = runtimeContents.split("\n");
    var lineMap = [ ];

    function mapLines(model, callback) {
        var entry = { };
        var start = lines.length;

        callback();

        var end = lines.length;

        if (model && model.location && model.location.start && model.location.start.line) {
            // model.location.start.line is 1-indexed, we want 0-indexed here
            lineMap.push({ "start": start, "end": end, "mapped": (model.location.start.line - 1) });
        }
    }

    _.each(model.enums, function(ojEnum) {
        // Anonymous enums are inlined
        if (!ojEnum.name) return;

        generateEnum(lines, ojEnum);
    });

    _.each(model.protocols, function(ojProtocol) {
        mapLines(ojProtocol, function() {
            generateProtocol(lines, ojProtocol);
        });
    });

    _.each(model.classes, function(ojClass) {
        var classSymbol  = symbolTyper.getSymbolForClassName(ojClass.name, false);
        var staticSymbol = symbolTyper.getSymbolForClassName(ojClass.name, true);

        classSymbols.push(classSymbol);
        staticSymbols.push(staticSymbol);

        mapLines(ojClass, function() {
            generateClass(lines, ojClass, classSymbol, staticSymbol);
        });
    });

    generateClass( lines, model.getAggregateClass(), "$oj_$Combined", "$oj_$StaticCombined" );
    classSymbols.unshift("$oj_$Combined");
    staticSymbols.unshift("$oj_$StaticCombined")

    lines.push("type $oj_$id_intersection = " + classSymbols.join("&") + ";");
    lines.push("type $oj_$id_union = "        + classSymbols.join("|") + ";");

    return {
        defs:  lines.join("\n"),
        lines: lineMap
    };
}


TypeChecker.prototype.check = function(callback)
{
    var defs          = this._defs;
    var defsLineMap   = this._defsLineMap;

    var code          = this._code;
    var codeLineMap   = this._codeLineMap;

    var symbolTyper   = this._model.getSymbolTyper();
    var noImplicitAny = this._noImplicitAny;

    var prependLineCount = this._prependLineCount;

    var duplicateMap = { };

    function getFileLineWithCodeLine(codeLine) {
        for (var file in codeLineMap) { if (codeLineMap.hasOwnProperty(file)) {
            var entry = codeLineMap[file];

            if (codeLine >= entry.start && codeLine < entry.end) {
                return { file: file, line: (codeLine - entry.start) + 1 };
            }
        }}

        return null;
    }

    function getFileLineWithDefsLine(defsLine) {
        for (var i = 0, length = defsLineMap.length; i < length; i++) {
            var entry = defsLineMap[i];

            if (defsLine >= entry.start && defsLine < entry.end) {
                // entry.mapped is the original AST node's (location.start.line - 1)
                // This doesn't account for prepended files (added by the modifier), so
                // offset accordingly

                console.log(defsLine, entry.start, entry.end, entry.mapped, prependLineCount);

                return getFileLineWithCodeLine(entry.mapped + prependLineCount);
            }
        }

        return null;
    }

    function makeHintsWithDiagnostic(diagnostic) {
        var lineColumn  = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        var fileLine    = null;

        if (diagnostic.file.fileName == "code.ts") {
            fileLine = getFileLineWithCodeLine(lineColumn.line);
        } else if (diagnostic.file.fileName == "defs.ts") {
            fileLine = getFileLineWithDefsLine(lineColumn.line);
        }

        var code        = diagnostic.code;
        var quotedMap   = { };
        var sawStatic   = false;
        var sawMethod   = false;
        var sawClass    = false;
        var sawProtocol = false;

        if (_.include(sBlacklistCodes, code)) {
            return null;
        }

        var reason = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        reason = reason.split("\n")[0];

        // messageText is a linked list of { messageText: , next: } objects
        // Traverse through it and set up quotedMap / saw*
        //
        (function() {
            function parseMessageText(object) {
                var code = object.code || code;
                var i    = 0;

                (object.messageText || object).replace(/'(.*?)'/g, function(a0, a1) {
                    if (a1.match(/^\$oj_C_/)) {
                        sawStatic = true;
                        sawClass = true;

                    } else if (a1.match(/\$oj_P_/)) {
                        sawStatic = true;
                        sawProtocol = true;

                    } else if (a1.match(/\$oj_c_/)) {
                        sawClass = true;

                    } else if (a1.match(/\$oj_p_/)) {
                        sawProtocol = true;

                    } else if (a1.match(/\$oj_f_/)) {
                        sawMethod = true;
                    }

                    a1 = symbolTyper.fromTypecheckerType(a1);

                    quotedMap[i] = a1;
                    quotedMap["" + code + ":" + i] = a1;

                    i++;

                    return a1;
                });
            }

            var messageText = diagnostic.messageText;
            while (messageText) {
                parseMessageText(messageText);
                messageText = messageText.next;
            }
        }());

        // Now look up the friendlier reason string from the map
        //
        (function() {
            var template = getReasonTemplate(code, sawClass, sawProtocol, sawMethod, sawStatic);

            var valid  = true;
            var result = null;
            if (!result) result = sReasonTemplateMap["" + code];

            if (template) {
                result = template.text.replace(/\{(.*?)\}/g, function(a0, a1) {
                    var replacement = quotedMap[a1];
                    if (!replacement) valid = false;
                    return replacement;
                });
            }

            if (valid && result) {
                reason = result;
            }
        }());

        // Fixup reason string - convert TypeScript types to oj types and reformat
        //
        (function() {
            reason = reason.replace(/'(.*?)'/g, function(a0, a1) {
                return "'" + symbolTyper.fromTypecheckerType(a1) + "'";
            });

            reason = symbolTyper.getSymbolicatedString(reason);

            reason = reason.replace(/[\:\.]$/, "");
        }());



        var result = {
            code:   code,
            column: lineColumn.column,
            name:   "OJTypecheckerHint",
            file:   fileLine ? fileLine.file : "generated",
            line:   fileLine ? fileLine.line : lineColumn.line,
            reason: reason 
        };

        // Only return if this error message is unique (defs can spam duplicate messages)
        var key = result.file + ":" + result.line + ":" + result.reason;
        if (!duplicateMap[key]) {
            duplicateMap[key] = true;
            return result;
        }

        return null;
    }

    var options = { };
    if (noImplicitAny) options.noImplicitAny = true;

    var hints = _.flatten(_.map(ts_transform(defs, code, options), function(diagnostic) {
        return makeHintsWithDiagnostic(diagnostic);
    }));

    hints = _.without(hints, null);

    callback(null, hints, defs, code);
}


module.exports = TypeChecker;
