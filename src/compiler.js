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
const Traverser   = require("./traverser");
const Utils       = require("./utils");

const OJError     = require("./errors").OJError;
const OJModel     = require("./model").OJModel;
const OJFile      = require("./model").OJFile;

const _           = require("lodash");
const fs          = require("fs");
const async       = require("async");



    function printTime(name, start) {
            console.error(name, Math.round(process.hrtime(start)[1] / (1000 * 1000)) + "ms");
    }

function    time(name, f) {
        var start = process.hrtime();
        f();
        printTime(name, start);
    }

module.exports = class Compiler {


constructor()
{
    this._files   = null;
    this._options = null;
    this._model   = null;   
    this._parent  = null;
}


_extractFilesFromOptions(optionsFiles, previousFiles)
{
    let existingMap = { };
    let outFiles = [ ];

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
        let ojFile, path, contents, time;

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
    let err = null;

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

    }, () => {
        callback(err);
    });
}


_buildFiles(files, model, options, callback)
{
    let err = null;

    async.each(files, (ojFile, callback) => {
        try { 
            let builder = new Builder(ojFile, model, options);
            builder.build();

        } catch (e) {
            Utils.addFilePathToError(ojFile.path, e);
            ojFile.error = e;
            if (!err) err = e;
        }

        callback();

    }, () => {
        model.prepare();
        callback(err);
    });
}


_generateJavaScript(files, model, options, callback)
{
    let err = null;

    async.each(files, (ojFile, callback) => {
        if (!ojFile.generatorLines) {
            try {
                const inLines   = ojFile.contents.split("\n");
                const modifier  = new Modifier(inLines, options);
                const generator = new Generator(ojFile, model, modifier, false, options);

                const result = generator.generate();
                ojFile.generatorLines    = result.lines;
                ojFile.generatorWarnings = result.warnings || [ ];

            } catch (e) {
                Utils.addFilePathToError(ojFile.path, e);
                ojFile.needsGenerate();
                ojFile.error = e;
                if (!err) err = e;
            }
        }

        callback();

    }, () => {
        callback(err);
    });
}


_runTypechecker(files, model, options, callback)
{
    let err = null;

    async.each(files, (ojFile, callback) => {
        if (!ojFile.typecheckerLines) {
            try {
                let inLines   = ojFile.contents.split("\n");
                let modifier  = new Modifier(inLines, options);
                let generator = new Generator(ojFile, model, modifier, true, options);

                let result = generator.generate();
                ojFile.typecheckerLines = result.lines;

            } catch (e) {
                Utils.addFilePathToError(ojFile.path, e);
                ojFile.needsTypecheck();
                ojFile.error = e;
                if (!err) err = e;
            }
        }

        callback();

    }, () => {
        if (err) {
            callback(err)
        } else {
            try {
                let checker = new TypeChecker(files, model, options);

                checker.check((err, hints, defs, code) => {
                    callback();
                });

            } catch (e) {
                callback(e);
            }
        }
    });
}


parent(compiler)
{
    this._parent = compiler;
}


compile(options, callback)
{
    let previousFiles   = this._files;
    let previousOptions = this._options;
    let previousModel   = this._model;

    // Extract options which don't affect parse/build/compile stages
    //
    function extractOption(key) {
        let result = options[key];
        options[key] = null;
        return result;
    }

    const optionsFiles         = extractOption("files");
    const optionsPrepend       = extractOption("prepend");
    const optionsAppend        = extractOption("append");
    const optionsSourceMapFile = extractOption("source-map-file");
    const optionsSourceMapRoot = extractOption("source-map-root");
    const optionsState         = extractOption("state");

    // Extract options.files and convert to a map of path->OJFiles
    const files = this._extractFilesFromOptions(optionsFiles, previousFiles);
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

    const model = new OJModel();
    if (this._parent && this._parent._model) {
        model.loadState(this._parent._model.saveState());
    } else if (optionsState) {
        model.loadState(optionsState);
    } 

    this._files   = files;
    this._options = options;

    let outputCode = null;
    let outputMap  = null;

    async.waterfall([
        // Parse files
        callback => {
            time("parse", () => {
                this._parseFiles(files, callback);
            });
        },

        // Build model
        callback => {
            time("build", () => {
                this._buildFiles(files, model, options, callback);
            });
        },

        // Perform model diff
        callback => {
            if (previousModel.hasGlobalChanges(model)) {
                _.each(files, ojFile => {
                    ojFile.needsGenerate();
                    ojFile.needsTypecheck();
                });

            } else {
                if (options["warn-unknown-selectors"]) {
                    var changedSelectors = previousModel.getChangedSelectorMap(model);

                    if (changedSelectors) {
                        _.each(files, ojFile => {
                            _.each(ojFile.usage.selectors, function(selectorName) {
                                if (changedSelectors[selectorName]) {
                                    ojFile.needsGenerate();
                                }
                            });
                        });
                    }
                }

                if (options["check-types"]) {
                    if (previousModel.hasTypeChanges(model)) {
                        _.each(files, ojFile => {
                            ojFile.needsTypecheck();
                        });
                    }
                }
            }


            // If we get here, our current model is valid.  Save it for next time
            this._model = model;

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
                callback(error);
            }
        });

        let result = {
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
}

}

