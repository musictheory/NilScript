/*
    compiler.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima     = require("./esprima");
var Syntax      = esprima.Syntax;

var Builder     = require("./builder");
var Modifier    = require("./modifier");
var Generator   = require("./generator");

var Hinter      = require("./hinter");
var TypeChecker = require("./typechecker");

var OJError     = require("./errors").OJError;
var OJModel     = require("./model").OJModel;

var _           = require("lodash");
var fs          = require("fs");

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


function Compiler(options)
{
    options = options || { };

    var paths    = [ ];
    var contents = [ ];

    // The 'files' option can either be an Array of String file paths, or
    // an Array of Objects with the following keys:
    //        path: file path 
    //    contents: file contents
    //
    _.each(options.files, function(f) {
        if (_.isString(f)) {
            paths.push(f);
            contents.push(fs.readFileSync(f).toString());

        } else {
            if (f.path && f.contents) {
                paths.push(f.path);
                contents.push(f.contents);
            }
        }
    });

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

    this._model = new OJModel();

    if (options.state) {
        this._model.loadState(options.state);
    }

    if (options["squeeze"]) {
        this._model.setupSqueezer(
            options["squeeze-start-index"] || 0,
            options["squeeze-end-index"]   || 0
        );
    }

    var lineCounts = [ ];
    var allLines   = [ ];

    for (var i = 0, length = contents.length; i < length; i++) {
        var lines = contents[i].split("\n");
        lineCounts.push(lines.length);
        Array.prototype.push.apply(allLines, lines);
    }

    this._inputFiles           = paths;
    this._inputLines           = allLines;
    this._inputLineCounts      = lineCounts;
    this._inputParserOptions   = parserOptions;
    this._inputModifierOptions = modifierOptions;

    this._options   = options;
}


Compiler.prototype._getFileAndLineForLine = function(inLine)
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


Compiler.prototype._cleanupError = function(e)
{
    if (e.line && !e.file) {
        var fileAndLine = this._getFileAndLineForLine(e.line);

        if (fileAndLine) {
            e.file = fileAndLine[0];
            e.line = fileAndLine[1];
        }
    }
}


Compiler.prototype.compile = function(callback)
{
    var dumpTime = this._options["dump-time"];

    var waitingForHinter  = false;
    var waitingForChecker = false;

    function finish(err, result) {
        if (err || (!waitingForHinter && !waitingForChecker)) {
            callback(err, result);
        }
    }

    function printTime(name, start) {
        if (dumpTime) {
            console.error(name, Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
        }
    }

    function time(name, f) {
        var start = process.hrtime();
        f();
        printTime(name, start);
    }

    try {
        var compiler           = this;
        var inputFiles         = this._inputFiles;
        var inputLines         = this._inputLines;
        var inputParserOptions = this._inputParserOptions;
        var model              = this._model;

        var result;
        var lineMap;
        var ast;

        // Parse to AST
        time("Parse", function() {
            try { 
                ast = esprima.parse(inputLines.join("\n"), inputParserOptions);
            } catch (e) {
                throw errorForEsprimaError(e);
            }
        });

        // Do first pass with Builder and save into model
        time("Build", function() {
            (new Builder(ast, model)).build();
        });

        var modifier  = new Modifier(this._inputFiles, this._inputLineCounts, this._inputLines, this._inputModifierOptions);
        var generator = new Generator(ast, model, modifier, false, this._options);

        var modifierForChecker;
        var generatorForChecker;
        if (this._options["check-types"]) {
            modifierForChecker  = new Modifier(this._inputFiles, this._inputLineCounts, this._inputLines.slice(0), this._inputModifierOptions);
            generatorForChecker = new Generator(ast, model, modifierForChecker, true, this._options);
        }

        // Do second pass with Generator
        time("Generate", function() {
            generator.generate();
        });

        time("Finish", function() {
            result = generator.finish();
        });

        // Add real file to errors
        _.each(result.warnings || [ ], function(e) {
            this._cleanupError(e);
        }.bind(this));

        // Add state to result
        time("Archive", function() {
            result.state = model.saveState();
            lineMap = result._lines;
            delete(result._lines);
        });

        // Type checker
        if (this._options["check-types"]) {
            var noImplicitAny = this._options["no-implicit-any"];

            time("Type Check", function() {
                var checker = new TypeChecker(model, generatorForChecker, inputFiles, noImplicitAny);

                waitingForChecker = true;

                checker.check(function(err, warnings) {
                    waitingForChecker = false;
                    result.warnings = (result.warnings || [ ]).concat(warnings);
                    finish(err, result);
                });
            });
        }

        if (this._options["dump-ast"]) {
            result.ast = JSON.stringify(this._ast, function(key, value) {
                if (key == "parent") {
                    return undefined;
                }
                return value;
            }, 4)
        }

        result.cache = this._options["cache"];

        if (this._options["jshint"]) {
            var config = this._options["jshint-config"];
            var ignore = this._options["jshint-ignore"];

            var hinter = new Hinter(result.code, config, ignore, lineMap, inputFiles, result.cache ? result.cache.hinter : { });

            waitingForHinter = true;

            var start = process.hrtime();

            hinter.run(function(err, hints) {
                waitingForHinter = false;
                result.warnings = (result.warnings || [ ]).concat(hints);

                if (result.cache) {
                    result.cache.hinter = hinter.getCache();
                }

                printTime("Hinter", start);

                finish(err, result);
            });

        } else {
            finish(null, result);
        }

    } catch (e) {
        if (e.name.indexOf("OJ") !== 0) {
            console.error("Internal oj error!")
            console.error("------------------------------------------------------------")
            console.error(e);
            console.error(e.stack);
            console.error("------------------------------------------------------------")
        }

        this._cleanupError(e);

        callback(e, null);
    }
}


module.exports = Compiler;
