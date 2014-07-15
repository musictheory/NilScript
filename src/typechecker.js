/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var fs      = require("fs");
var cp      = require("child_process");
var temp    = require("temp");
var dirname = require("path").dirname;
var _       = require("lodash");

temp.track();


function TypeChecker(model, generator, files)
{
    this._defs  = this._getDefinition(model, generator);

    generator.generate();

    var result = generator.finish();
    this._contents = result.code;
    this._lineMap  = result._lines;

    this._files = files;
    this._generator = generator;
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

    function makeDeclarationForMethod(method) {
        var methodName = generator.getSymbolForSelectorName(method.selectorName);
        var parameters = [ ];

        for (var i = 0, length = method.parameterTypes.length; i < length; i++) {
            var parameterType = method.parameterTypes[i];
            var variableName  = method.variableNames[i];

            parameters.push(variableName + " : " + generator.getTypecheckerType(parameterType));
        }

        return methodName + "(" + parameters.join(", ") + ") : " + generator.getTypecheckerType(method.returnType) + ";";
    }

    _.each(model.classes, function(ojClass) {
        var className      = generator.getSymbolForClassName(ojClass.name);
        var staticName     = className + "$Static";

        var superclassName       = ojClass.superclassName ? generator.getSymbolForClassName(ojClass.superclassName) : "$oj_BaseObject";
        var superclassStaticName = superclassName + "$Static";

        var classMethodDeclarations    = _.map(ojClass.getClassMethods(),    makeDeclarationForMethod);
        var instanceMethodDeclarations = _.map(ojClass.getInstanceMethods(), makeDeclarationForMethod);

        lines.push(
            "declare class " + className + " extends " + superclassName + " {",

            "static alloc() : " + className + ";",
            "class() : " + staticName + ";",
            "$oj_super() : " + superclassName + ";",
            "static $oj_super() : " + superclassName + "$Static" + ";"
        );

        _.each(classMethodDeclarations, function(classMethodDeclaration) {
            lines.push("static " + classMethodDeclaration);
        });

        _.each(instanceMethodDeclarations, function(instanceMethodDeclaration) {
            lines.push(instanceMethodDeclaration);
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

        _.each(classMethodDeclarations, function(classMethodDeclaration) {
            lines.push(classMethodDeclaration);
        });

        lines.push("}");
    });

    return fs.readFileSync(dirname(__filename) + "/runtime.d.ts") + "\n" + lines.join("\n");
}


TypeChecker.prototype.check = function(callback)
{
    var defs      = this._defs;
    var contents  = this._contents;
    var lineMap   = this._lineMap;
    var generator = this._generator;

    function getFileAndLine(inLine) {
        var result;

        inLine - defs.length;

        for (var file in lineMap) { if (lineMap.hasOwnProperty(file)) {
            var entry = lineMap[file];

            if (inLine >= entry.start && inLine < entry.end) {
                result = [ file, inLine - entry.start ];
                break;
            }
        }}

        return result;
    }

    try {
        cp.exec("which tsc", function (error, stdout, stderr) {
            if (error) {
                console.error("");
                console.error("TypeScript must be installed to use --check-types.  Install via:");
                console.error("");
                console.error("    npm install -g typescript");
                console.error("");

                callback(error, null);
                return;
            }

            var cmd = stdout.trim();
            var args = [ ];

            temp.mkdir("oj-typechecker", function(err, dirPath) {
                if (err) {
                    callback(err);
                    return;
                }

                fs.writeFileSync(dirPath + "/defs.ts",    defs);
                fs.writeFileSync(dirPath + "/content.ts", contents);

                args.push(dirPath + "/defs.ts");
                args.push(dirPath + "/content.ts");

                cp.execFile(cmd, args, { }, function (error, stdout, stderr) {
                    var lines = stderr.split("\n");
                    var line, m;

                    var hints = [ ];
                    var hint;

                    for (var i = 0, length = lines.length; i < length; i++) {
                        var line = lines[i];

                        if ((m = line.match(/\(([0-9]+),([0-9]+)\):\s+error\s+(.*?)\:\s+(.*?)$/))) {
                            var fileAndLine = getFileAndLine(m[1]);

                            hint = { };
                            if (fileAndLine) {
                                hint.file      = fileAndLine[0];
                                hint.line      = fileAndLine[1];
                                hint.column    = m[2];
                                hint.code      = m[3];
                                hint.name     = "OJTypecheckerHint";
                                hint.reason   = m[4];
                            }

                            hints.push(hint);

                        } else {
                            line.trim();

                            if (hint && line.length) {
                                hint.reason = "\n    " + hint.reason.trim() + "\n    " + line.trim();
                            }
                        }
                    }

                    hints = _.filter(hints, function(hint) {
                        hint.reason = generator.getSymbolicatedString(hint.reason);

                        return hint.code != "TS2087";
                    })

                    callback(null, hints);
                });
            });
        });

    } catch (e) {
        callback(e);
    }
}


module.exports = TypeChecker;
