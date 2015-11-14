/*
    compiler.js
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const esprima     = require("../ext/esprima");

const Builder     = require("./builder");
const Modifier    = require("./modifier");
const Generator   = require("./generator");
const TypeChecker = require("./typechecker");

const OJError     = require("./errors").OJError;
const OJModel     = require("./model").OJModel;
const OJFile      = require("./model").OJFile;

const _           = require("lodash");
const fs          = require("fs");
const async       = require("async");


class Compiler {


_extractFilesFromOptions(optionsFiles, previousFiles)
{
    var existingMap = { };
    var outFiles = [ ];

    _.each(previousFiles, function(ojFile) {
        existingMap[ojFile.path] = ojFile;
    });

    // The 'files' option can either be an Array of String file paths, or
    // an Array of Objects with the following keys:
    //        path: file path 
    //    contents: file contents
    //        time: file modification time
    //
    _.each(optionsFiles, function(f) {
        var ojFile, path, contents, time;

        if (_.isString(f)) {
            path = f;
        } else {
            path     = f.path;
            contents = f.contents;
            time     = f.time || Date.now()
        }

        if (!path) return;

        ojFile = existingMap[path] || new OJFile(path);

        if (contents && time) {
            ojFile.updateWithContentsAndTime(contents, time);
        } else {
            ojFile.updateFromDisk();
        }

        outFiles.push(ojFile);
    });

    return outFiles;
}


_parseFiles(files, callback)
{
    var err = null;

    async.each(files, (ojFile, callback) => {
        if (!ojFile.ast) {
            try { 
                ojFile.ast = esprima.parse(ojFile.contents, { loc: true });
                ojFile.needsGenerate();
                ojFile.needsTypecheck();

            } catch (inError) {
                let message = inError.description;
                message = message.replace(/$.*Line:/, "");

                let outError = new Error(message);

                outError.file   = ojFile.path;
                outError.line   = inError.lineNumber;
                outError.column = inError.column;
                outError.name   = OJError.ParseError;
                outError.reason = message;

                ojFile.needsParse();
                ojFile.error = outError;
                if (!err) err = outError;
            }
        }

        callback();

    }, () => { callback(err); });
}


_buildFiles(files, model, options, callback)
{
    var err = null;

    async.each(files, (ojFile, callback) => {
        try { 
            var builder = new Builder(ojFile.ast, model, options);
            builder.build();

        } catch (e) {
            ojFile.error = e;
            if (!err) err = e;
        }

        callback();

    }, () => { callback(err); });
}


_generateJavaScript(files, model, options, callback)
{
    var err = null;

    async.each(files, (ojFile, callback) => {
        if (!ojFile.generatorLines) {
            try {
                var inLines   = ojFile.contents.split("\n");
                var modifier  = new Modifier(inLines, options);
                var generator = new Generator(ojFile.ast, model, modifier, false, options);

                generator.generate();

                var result = generator.finish();

                ojFile.generatorLines = result.lines;
                ojFile.generatorWarnings = result.warnings || [ ];

            } catch (e) {
                ojFile.needsGenerate();
                ojFile.error = e;
                if (!err) err = e;
            }
        }

        callback();

    }, () => { callback(err); });
}


_runTypechecker(files, model, options, callback)
{
    callback();
}


compile(options, callback)
{
    var previousFiles   = this._files;
    var previousOptions = this._options;
    var previousModel   = this._model;

    // Extract options which don't affect parse/build/compile stages
    //
    function extractOption(key) {
        var result = options[key];
        options[key] = null;
        return result;
    }

    var optionsFiles         = extractOption("files");
    var optionsPrepend       = extractOption("prepend");
    var optionsAppend        = extractOption("append");
    var optionsSourceMapFile = extractOption("source-map-file");
    var optionsSourceMapRoot = extractOption("source-map-root");
    var optionsState         = extractOption("state");

    // Extract options.files and convert to a map of path->OJFiles
    var files = this._extractFilesFromOptions(optionsFiles, previousFiles);
    options.files = null;

    // If remaining options changed, invalidate everything
    //
    if (!_.isEqual(options, previousOptions)) {
        previousOptions = options;
        previousModel   = new OJModel();

        _.each(files, ojFile => {
            ojFile.invalidateAllResults();
        });
    }

    var model = new OJModel();
    if (optionsState) model.loadState(optionsState);

    var outputCode = null;
    var outputMap  = null;

    async.waterfall([
        // Parse files
        callback => {
            this._parseFiles(files, callback);
        },

        // Build model
        callback => {
            this._buildFiles(files, model, options, callback);
        },

        // Perform model diff
        callback => {
            var diffResult = previousModel.diffWithModel(model);
            console.log(diffResult);

            if (diffResult == OJModel.DiffResult.GlobalsChanged || diffResult == OJModel.DiffResult.SelectorsChanged) {
                _.each(files, ojFile => {
                    ojFile.needsGenerate();
                    ojFile.needsTypecheck();
                });


                    console.log("globals changed");

            } else if (diffResult == OJModel.DiffResult.SelectorsChanged) {
                // Just check some files for missing selectors?

                console.log("selectors changed");

            }

            console.log("local changed");

            callback();
        },

        // Run generator
        callback => {
            if (options["output-language"] != "none") {
                this._generateJavaScript(files, model, options, callback);
            } else {
                callback();
            }
        },

        // Run typechecker
        callback => {
            if (options["check-types"]) {
                this._runTypechecker(files, model, options, callback);
            } else {
                callback();
            }
        },

        // Concatenate output
        callback => {
            let linesArray = [ ];

            let prependLines = _.isArray(optionsPrepend) ? optionsPrepend : (optionsPrepend || "").split("\n");
            let appendLines  = _.isArray(optionsAppend)  ? optionsAppend  : (optionsAppend  || "").split("\n");

            linesArray.push(prependLines);
            _.each(files, ojFile => {
                linesArray.push(ojFile.generatorLines);
            });
            linesArray.push(appendLines);

            outputCode = Array.prototype.concat.apply([ ], linesArray).join("\n");

            callback();
        }

    ], function(err) {
        let errors = _.compact(_.map(files, ojFile => ojFile.error));

        // If we have an internal error, throw it now
        _.each(errors, function(error) {
            if (error.name.indexOf("OJ") !== 0) {
                throw error;
            }
        });

        var result = {
            code:     outputCode,
            map:      outputMap,
            errors:   errors,

            warnings: _.compact(_.flatten(_.map(files, ojFile => [
                ojFile.generatorWarnings,
                ojFile.typecheckerWarnings
            ])))
        };

        if (options["include-state"]) {
            result.state = model.saveState();
        }

        callback(err, result);
    });

    this._files   = files;
    this._options = options;
    this._model   = model;
}

}


module.exports = {
    Compiler: Compiler,

    compile: function(options, callback) {
        try {
            if (options) {
                options["include-state"] = true;
            }

            var compiler = new Compiler();
            compiler.compile(options, callback);

        } catch (e) {
            if (e.name.indexOf("OJ") !== 0) {
                console.error("Internal oj error!")
                console.error("------------------------------------------------------------")
                console.error(e);
                console.error(e.stack);
                console.error("------------------------------------------------------------")
            }

            callback(e, null);
        }
    }
}
