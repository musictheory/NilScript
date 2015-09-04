/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var fs      = require("fs");
var cp      = require("child_process");
var path    = require("path");
var dirname = require("path").dirname;
var _       = require("lodash");
var ts      = require("typescript");

var sLibrarySource;


/*
    See https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API
*/
function ts_transform(contentArray, librarySource, options)
{
    if (!options) options = { };

    var filenameToContentMap = { };
    var filenames = [ ];

    _.each(contentArray, function(content) {
        var filename = "file" + filenames.length + ".ts";
        filenames.push(filename);
        filenameToContentMap[filename] = content;
    })

    filenameToContentMap["lib.d.ts"] = librarySource;

    var program = ts.createProgram(filenames, options, {
        getSourceFile: function(filename, languageVersion) {
            var content = filenameToContentMap[filename];
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
    var allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    var errors = allDiagnostics.map(function(diagnostic) {
        var lineColumn = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

        var reason = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        if (!reason.split) console.log(reason)
        if (reason) reason = reason.split("\n");
        if (reason) reason = reason[0];

        return {
            filename: diagnostic.file.filename,
            line: lineColumn.line,
            column: lineColumn.column,
            reason: reason,
            code: diagnostic.code
        }
    });

    return errors;
}



function TypeChecker(model, generator, files, noImplicitAny)
{
    this._defs  = this._getDefinition(model, generator);

    generator.generate();

    var result = generator.finish();
    this._contents = result.code;
    this._lineMap  = result._lines;

    this._files = files;
    this._generator = generator;
    this._noImplicitAny = noImplicitAny;
}


TypeChecker.prototype._getDefinition = function(model, generator)
{
    var lines = [ ];

    _.each(model.enums, function(ojEnum) {
        // Anonymous enums are inlined
        if (!ojEnum.name) return;

        lines.push("enum " + ojEnum.name + " {");

        _.each(ojEnum.values, function(value, name) {
            lines.push(name + " = " + value + ",");
        });

        lines.push("}");
    });

    function makeDeclarationForMethod(method, ojClass) {
        var methodName = generator.getSymbolForSelectorName(method.selectorName);
        var parameters = [ ];

        for (var i = 0, length = method.parameterTypes.length; i < length; i++) {
            var parameterType = method.parameterTypes[i];
            var variableName  = method.variableNames[i];

            parameters.push(variableName + " : " + generator.getTypecheckerType(parameterType));
        }

        return methodName + "(" + parameters.join(", ") + ") : " + generator.getTypecheckerType(method.returnType, ojClass) + ";";
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

    _.each(model.classes, function(ojClass) {
        var className      = generator.getSymbolForClassName(ojClass.name);
        var staticName     = className + "$Static";

        var superclassName       = ojClass.superclassName ? generator.getSymbolForClassName(ojClass.superclassName) : "$oj_BaseObject";
        var superclassStaticName = superclassName + "$Static";

        lines.push(
            "declare class " + className + " extends " + superclassName + " {",

            "static alloc() : " + className + ";",
            "class() : " + staticName + ";",
            "static class() : " + staticName + ";",
            "init()  : " + className + ";",
            "$oj_super() : " + superclassName + ";",
            "static $oj_super() : " + superclassName + "$Static" + ";"
        );

        var methods = [ ].concat(
            ojClass.getAllMethods(),
            getInstancetypeMethods(ojClass)
        );

        var classMethodDeclarations    = [ ];
        var instanceMethodDeclarations = [ ];

        _.each(methods, function(method) {
            var arr = (method.selectorType == "+") ? classMethodDeclarations : instanceMethodDeclarations;
            arr.push(makeDeclarationForMethod(method, ojClass));
        });

        _.each(classMethodDeclarations, function(decl) {
            lines.push("static " + decl);
        });

        _.each(instanceMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        _.each(ojClass.getAllIvars(), function(ivar) {
            lines.push(generator.getSymbolForIvar(ivar) + " : " +  generator.getTypecheckerType(ivar.type) + ";");
        });

        lines.push("}");

        lines.push(
            "declare class " + staticName + " extends " + superclassStaticName + " {",
            "alloc() : " + className  + ";",
            "class() : " + staticName + ";",
            "$oj_super() : " + superclassName + "$Static" + ";"
        );

        _.each(classMethodDeclarations, function(decl) {
            lines.push(decl);
        });

        lines.push("}");
    });

    return fs.readFileSync(dirname(__filename) + "/runtime.d.ts") + "\n" + lines.join("\n");
}


TypeChecker.prototype.check = function(callback)
{
    var defs          = this._defs;
    var contents      = this._contents;
    var lineMap       = this._lineMap;
    var generator     = this._generator;
    var noImplicitAny = this._noImplicitAny;

    function fromTypeScriptType(tsType) {
        var map = {
            "$oj_BaseObject":        "BaseObject",
            "$oj_BaseObject$Static": "Class",
            "any[]":                 "Array",
            "number":                "Number",
            "boolean":               "BOOL",
            "string":                "String",
        };

        if (map[tsType]) {
            return map[tsType];
        }

        if (tsType.match(/\[\]$/)) {
            tsType = tsType.replace(/\[\]$/, "");
            return "Array<" + fromTypeScriptType(tsType) + ">";
        }

        return generator.getSymbolicatedString(tsType);
    }


    function fixReason(reason, code) {
        var quoted   = [ ];
        var isStatic = false;
        var isMethod = false;

        reason = reason.replace(/'(.*?)'/g, function() {
            var arg = arguments[1];

            if (arg.match(/\$Static$/)) {
                isStatic = true;
                arg = arg.replace("$Static", "");

            } else if (arg.match(/\$oj_f_/)) {
                isMethod = true;
            }

            arg = fromTypeScriptType(arg);
            quoted.push(arg);

            return "'" + arg + "'";
        });

        // Property '$0' does not exist on type '$1'.
        if (code == 2339) { 
            if (isMethod) {
                if (isStatic) {
                    return "No known class method: +[" + quoted[1] + " " + quoted[0] + "]";
                } else {
                    return "No known instance method: -[" + quoted[1] + " " + quoted[0] + "]";
                }
            }
        }

        reason = reason.replace(/\:$/, "");

        return reason;
    }

    function getFileAndLine(inLine) {
        var result;

        for (var file in lineMap) { if (lineMap.hasOwnProperty(file)) {
            var entry = lineMap[file];

            if (inLine >= entry.start && inLine < entry.end) {
                result = [ file, inLine - entry.start ];
                break;
            }
        }}

        return result;
    }

    var options = { };
    if (noImplicitAny) options.noImplicitAny = true;


    // Eventually, there should be an option/way to switch to "lib.core.d.ts"
    // Keep in sync with: https://github.com/Microsoft/TypeScript/issues/494 ?
    //
    if (!sLibrarySource) {
        sLibrarySource = fs.readFileSync(path.join(path.dirname(require.resolve('typescript')), 'lib.d.ts')).toString();
    }

    var errors = ts_transform([ defs, contents ], sLibrarySource, options);

    var hints = [ ];
    var hint;

    _.each(errors, function(e) {
        var fileAndLine = getFileAndLine(e.line);

        hint = { };
        if (fileAndLine) {
            hint.file      = fileAndLine[0];
            hint.line      = fileAndLine[1];
        } else {
            hint.file      = "<generated>";
            hint.line      = e.line;
        }

        hint.column    = e.column;
        hint.code      = e.code;
        hint.name     = "OJTypecheckerHint";
        hint.reason   = fixReason(e.reason, e.code);

        hints.push(hint);
    });

    hints = _.filter(hints, function(hint) {
        if (hint.reason) {
            hint.reason = generator.getSymbolicatedString(hint.reason);
        } else {
            // console.log(hint);
        }

        return hint.code != 2087;
    })

    callback(null, hints);
}


module.exports = TypeChecker;
