/*
    compiler.js
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _               = require("lodash");
const fs              = require("fs");
const path            = require("path");
const async           = require("async");

const esprima         = require("../ext/esprima");

const Builder         = require("./builder");
const Generator       = require("./generator");
const Utils           = require("./utils");
const Typechecker     = require("./typechecker/Typechecker");

const OJError         = require("./errors").OJError;
const OJModel         = require("./model").OJModel;
const OJFile          = require("./model").OJFile;
    

module.exports = class Compiler {


constructor()
{
    this._files   = null;
    this._options = null;
    this._defs    = null;
    this._model   = null;   
    this._parent  = null;
    this._checker = null;
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
                let generator = new Generator(ojFile, model, false, options);

                let result = generator.generate();
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


_runTypechecker(typechecker, defs, files, model, options, callback)
{
    let err = null;

    async.each(files, (ojFile, callback) => {
        if (!ojFile.typecheckerCode) {
            try {
                let generator = new Generator(ojFile, model, true, options);
                let result = generator.generate();
                ojFile.typecheckerCode = result.lines.join("\n");

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
                typechecker.check(model, defs, files, (err, warnings, defs, code) => {
                    callback(null, warnings);
                });

            } catch (e) {
                callback(e, null);
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
    let previousDefs    = this._defs;
    let previousOptions = this._options;
    let previousModel   = this._model;

    // Extract options which don't affect parse/build/compile stages
    //
    function extractOption(key) {
        let result = options[key];
        options[key] = null;
        return result;
    }

    let optionsFiles         = extractOption("files");
    let optionsDefs          = extractOption("defs");
    let optionsPrepend       = extractOption("prepend");
    let optionsAppend        = extractOption("append");
    let optionsSourceMapFile = extractOption("source-map-file");
    let optionsSourceMapRoot = extractOption("source-map-root");
    let optionsState         = extractOption("state");

    // Extract options.files and convert to a map of path->OJFiles
    let files = this._extractFilesFromOptions(optionsFiles, previousFiles);
    options.files = null;

    let defs = this._extractFilesFromOptions(optionsDefs, previousDefs);
    options.defs = null;

    // These options aren't extracted
    let optionsCheckTypes     = options["check-types"];
    let optionsOutputLanguage = options["output-language"];

    // If remaining options changed, invalidate everything
    //
    if (!_.isEqual(options, previousOptions)) {
        previousOptions = options;
        previousModel   = new OJModel();

        _.each(files, ojFile => {
            ojFile.needsAll();
        });

        this._checker = null;
    }

    let model = new OJModel();
    if (this._parent && this._parent._model) {
        model.loadState(this._parent._model.saveState());
    } else if (optionsState) {
        model.loadState(optionsState);
    } 

    this._files   = files;
    this._options = options;
    this._defs    = defs;

    if (optionsCheckTypes && !this._checker) {
        this._checker = new Typechecker(options);
    }

    let outputCode = null;
    let outputMap  = null;
    let typecheckerWarnings = null;

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
            if (previousModel.hasGlobalChanges(model)) {
                _.each(files, ojFile => {
                    ojFile.needsGenerate();
                    ojFile.needsTypecheck();
                });

                if (this._checker) {
                    this._checker.invalidateGlobalState();
                }

            } else {
                if (options["warn-unknown-selectors"]) {
                    let changedSelectors = previousModel.getChangedSelectorMap(model);

                    if (changedSelectors) {
                        _.each(files, ojFile => {
                            _.each(ojFile.uses.selectors, function(selectorName) {
                                if (changedSelectors[selectorName]) {
                                    ojFile.needsGenerate();
                                }
                            });
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
            if (optionsOutputLanguage != "none") {
                this._generateJavaScript(files, model, options, callback);
            } else {
                callback();
            }
        },

        // Run typechecker
        callback => {
            if (optionsCheckTypes) {
                this._runTypechecker(this._checker, defs, files, model, options, (err, warnings) => {
                    typecheckerWarnings = warnings;
                    callback(err);
                });

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

    ], err => {
        let errors = _.compact(_.map(files, ojFile => ojFile.error));

        // If we have an internal error, throw it now
        if (err && err.name && !err.name.startsWith("OJ")) {
            throw err;
        }

        _.each(errors, function(error) {
            if (!error.name.startsWith("OJ")) {
                throw error;
            }
        });

        let warnings = _.map(files, ojFile => [
            ojFile.generatorWarnings,
        ]);

        warnings.push(typecheckerWarnings);

        let result = {
            code:     outputCode,
            map:      outputMap,
            errors:   errors,
            warnings: _.compact(_.flatten(warnings))
        };

        if (options["include-state"]) {
            result.state = model.saveState();
        }

        callback(err, result);
    });
}

}

