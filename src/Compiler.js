/*
    Compiler.js
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _               = require("lodash");
const fs              = require("fs");
const path            = require("path");
const async           = require("async");

const esprima         = require("../ext/esprima");

const Builder         = require("./Builder");
const Generator       = require("./Generator");
const SourceMapper    = require("./SourceMapper");
const FunctionMapper  = require("./FunctionMapper");
const Typechecker     = require("./typechecker/Typechecker");
const Utils           = require("./Utils");
const Log             = Utils.log;

const NSError         = require("./Errors").NSError;
const NSWarning       = require("./Errors").NSWarning;
const NSModel         = require("./model").NSModel;
const NSFile          = require("./model").NSFile;

const NSCompileCallbackFile = require("./model").NSCompileCallbackFile;


const sPublicOptions = [

    // Input options
    "files",                     // String or Object, files to compile
    "prepend",                   // String or Array<String>, content/lines to prepend, not compiled
    "append",                    // String or Array<String>, content/lines to append, not compiled
    "state",                     // Object, state from previous compile

    "parser-source-type",        // Passed to Esprima as sourceType.  'script' or 'module'

    // Output options
    "output-language",           // Output language ('none' or 'es5' public, 'typechecker' for debugging only)
    "include-map",               // Boolean, include 'map' key in results object
    "include-state",             // Boolean, include 'state' key in results object
    "source-map-file",           // Output source map file name
    "source-map-root",           // Output source map root URL

    "before-compile",            // Function, callback to call per-file before the ns->js compile
    "after-compile",             // Function, callback to call per-file after the ns->js compile

    // Squeezer options
    "squeeze",                   // Boolean, enable squeezer
    "squeeze-start-index",       // Number, start index for squeezer
    "squeeze-end-index",         // Number, end index for squeezer"

    // Typechecker options
    "check-types",               // Boolean, enable type checker
    "defs",                      // String or Object, additional typechecker defs
    "typescript-lib",            // String, specify alternate lib.d.ts file
    "no-implicit-any",           // Boolean, disallow implicit any
    "no-implicit-returns",       // Boolean, disallow implicit returns
    "no-unreachable-code",       // Boolean, inverts tsc's "--allowUnreachableCode" option
    
    "strict-functions",          // Boolean, enforce TypeScript-style functions
    "strict-object-literals",    // Boolean, enforce TypeScript object literals

    // Warnings
    "warn-debugger",             // Boolean, warn about use of 'debugger' statement
    "warn-empty-array-element",  // Boolean, warn about empty array element
    "warn-global-no-type",       // Boolean, warn about missing type annotations on @globals
    "warn-this-in-methods",      // Boolean, warn about usage of 'this' in ns methods
    "warn-self-in-non-methods",  // Boolean, warn about usage of 'self' in non-methods
    "warn-unknown-ivars",        // Boolean, warn about unknown ivars
    "warn-unknown-selectors",    // Boolean, warn about usage of unknown selectors
    "warn-unknown-superclasses", // Boolean, warn about usage of unknown superclasses
    "warn-unused-ivars",         // Boolean, warn about unused ivars

    // Private / Development
    "dev-dump-tmp",              // Boolean, dump debug info to /tmp
    "dev-print-log",             // Boolean, print log to stdout 
    "allow-private-options",     // Boolean, allow use of sPrivateOptions (see below)
];
let sPublicOptionsMap = null;


// Please file a GitHub issue if you wish to use these
const sPrivateOptions = [
    "additional-inlines",
    "include-bridged",
    "include-function-map"
];
let sPrivateOptionsMap = null;


module.exports = class Compiler {


constructor()
{
    this._files   = null;
    this._options = null;
    this._defs    = null;
    this._model   = null;   
    this._parents = null;
    this._checker = null;
}


_checkOptions(options)
{
    if (!sPublicOptionsMap) {
        sPublicOptionsMap = { };
        _.each(sPublicOptions, option => { sPublicOptionsMap[option] = true; });
    }

    if (!sPrivateOptionsMap) {
        sPrivateOptionsMap = { };
        _.each(sPrivateOptions, option => { sPrivateOptionsMap[option] = true; });
    }

    let allowPrivate = options["allow-private-options"];

    _.each(options, (value, key) => {
        if (                sPublicOptionsMap[ key]) return;
        if (allowPrivate && sPrivateOptionsMap[key]) return;

        throw new Error("Unknown NilScript option: " + key);
    });
}


_extractFilesFromOptions(optionsFiles, previousFiles)
{
    let existingMap = { };
    let outFiles = [ ];

    _.each(previousFiles, nsFile => {
        existingMap[nsFile.path] = nsFile;
    });

    if (!_.isArray(optionsFiles)) {
        Utils.throwError(NSError.APIMisuse, "options.files must be an array");
    }

    // The 'files' option can either be an Array of String file paths, or
    // an Array of Objects with the following keys:
    //        path: file path 
    //    contents: file contents
    //        time: file modification time
    //
    _.each(optionsFiles, function(f) {
        let nsFile, path, contents, time;

        if (_.isString(f)) {
            path = f;

        } else if (_.isObject(f)) {
            path     = f.path;
            contents = f.contents;
            time     = f.time || Date.now()

        } else {
            Utils.throwError(NSError.APIMisuse, "Each member of options.files must be a string or object");
        }

        if (!path) {
            Utils.throwError(NSError.APIMisuse, "No 'path' key in " + f);
        }

        nsFile = existingMap[path] || new NSFile(path);

        if (contents && time) {
            nsFile.updateWithContentsAndTime(contents, time);
        } else {
            nsFile.updateFromDisk();
        }

        outFiles.push(nsFile);
    });

    return outFiles;
}


_runBeforeCompileCallback(beforeCompileCallback, nsFile, doneCallback)
{
    let lines    = nsFile.contents.split("\n");
    let warnings = [ ];

    let callbackFile = new NSCompileCallbackFile(nsFile.path, lines, warnings)

    beforeCompileCallback(callbackFile, (error) => {
        if (error) {
            Utils.addFilePathToError(nsFile.path, error);

            Log(`${nsFile.path} needsPreprocess due to error: '${error}'`);
            nsFile.needsPreprocess = true;

        } else {
            nsFile.contents = callbackFile._lines.join("\n");
            nsFile.needsPreprocess = false;
        }

        doneCallback(error);
    });
}


_preprocessFiles(files, options, callback)
{
    let err = null;
    let beforeCompileCallback = options["before-compile"];

    async.each(files, (nsFile, callback) => {
        if (nsFile.needsPreprocess) {
            if (beforeCompileCallback) {
                try { 
                    this._runBeforeCompileCallback(beforeCompileCallback, nsFile, callback);
                } catch (e) {
                    if (!err) err = e;
                    callback();
                }

            } else {
                nsFile.needsPreprocess = false;
                callback();
            }

        } else {
            callback();
        }

    }, (e) => {
        callback(err || e);
    });
}


_parseFiles(files, options, callback)
{
    let err = null;

    async.each(files, (nsFile, callback) => {
        if (!nsFile.ast) {
            Log(`Parsing ${nsFile.path}`);

            try { 
                let sourceType = options["parser-source-type"] || "script";
                nsFile.ast = esprima.parse(nsFile.contents, { loc: true, sourceType: sourceType });

                nsFile.parseError = null;
                nsFile.needsGenerate();
                nsFile.needsTypecheck();

            } catch (inError) {
                let message = inError.description || inError.toString();
                message = message.replace(/$.*Line:/, "");

                let outError = new Error(message);

                outError.file   = nsFile.path;
                outError.line   = inError.lineNumber;
                outError.column = inError.column;
                outError.name   = NSError.ParseError;
                outError.reason = message;

                nsFile.needsParse();
                nsFile.parseError = outError;
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

    async.each(files, (nsFile, callback) => {
        try { 
            let builder = new Builder(nsFile, model, options);
            builder.build();
            nsFile.buildError = null;

        } catch (e) {
            Utils.addFilePathToError(nsFile.path, e);
            nsFile.needsParse();
            nsFile.buildError = e;
            if (!err) err = e;
        }

        callback();

    }, () => {
        if (err) {
            callback(err);
        } else {
            try {
                model.prepare();
            } catch (e) {
                callback(e);
            }

            callback();
        }
    });
}


_runAfterCompileCallback(afterCompileCallback, nsFile, doneCallback)
{
    let callbackFile = new NSCompileCallbackFile(nsFile.path, nsFile.generatorLines, nsFile.generatorWarnings);

    afterCompileCallback(callbackFile, (error) => {
        if (error) {
            Utils.addFilePathToError(nsFile.path, error);

            Log(`${nsFile.path} needsGenerate due to error: '${error}'`);
            nsFile.needsGenerate();
            nsFile.generatorError = error;

        } else {
            nsFile.generatorError    = null;
            nsFile.generatorLines    = callbackFile._lines;
            nsFile.generatorWarnings = callbackFile._warnings;
        }

        doneCallback(error);
    });
}


_generateJavaScript(files, model, options, callback)
{
    let err = null;

    let afterCompileCallback = options["after-compile"];

    async.each(files, (nsFile, callback) => {
        if (!nsFile.generatorLines) {
            async.series([
                callback => {
                    try {
                        Log(`Generating ${nsFile.path}`);

                        let generator = new Generator(nsFile, model, false, options);
                        let result    = generator.generate();

                        nsFile.generatorError    = null;
                        nsFile.generatorLines    = result.lines;
                        nsFile.generatorWarnings = result.warnings || [ ];

                    } catch (e) {
                        Utils.addFilePathToError(nsFile.path, e);

                        Log(`${nsFile.path} needsGenerate due to error: '${e}'`);
                        nsFile.needsGenerate();
                        nsFile.generatorError = e;

                        if (!err) err = e;
                    }

                    callback();
                },

                callback => {
                    if (afterCompileCallback) {
                        try {
                            this._runAfterCompileCallback(afterCompileCallback, nsFile, callback);
                        } catch (e) {
                            if (!err) err = e;
                            callback();
                        }

                    } else {
                        callback();
                    }
                }

            ], callback);

        } else {
            callback();
        }

    }, () => {
        callback(err);
    });
}


_runTypechecker(typechecker, defs, files, model, options, callback)
{
    let err = null;

    async.each(files, (nsFile, callback) => {
        if (!nsFile.typecheckerCode) {
            try {
                let generator = new Generator(nsFile, model, true, options);
                let result = generator.generate();

                nsFile.typecheckerError = null;
                nsFile.typecheckerCode  = result.lines.join("\n");

            } catch (e) {
                Utils.addFilePathToError(nsFile.path, e);
                nsFile.needsTypecheck();
                nsFile.typecheckerError = e;
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


_finish(files, options, callback)
{
    function getLines(arrayOrString) {
        if (_.isArray(arrayOrString)) {
            return _.flattenDeep(arrayOrString).join("\n").split("\n");
        } else if (_.isString(arrayOrString)) {
            return arrayOrString.split("\n");
        } else {
            return [ ];
        }
    }

    try {
        let prependLines = getLines( options["prepend"] );
        let appendLines  = getLines( options["append"] );

        let outputSourceMap   = null;
        let outputFunctionMap = null;

        if (options["include-map"]) {
            let mapper = new SourceMapper(options["source-map-file"], options["source-map-root"]);

            mapper.add(null, prependLines);

            _.each(files, nsFile => {
                mapper.add(nsFile.path, nsFile.generatorLines);
            });
            
            mapper.add(null, appendLines);

            outputSourceMap = mapper.getSourceMap();
        }

        if (options["include-function-map"]) {
            let functionMaps = { };

            _.each(files, nsFile => {
                let mapper = new FunctionMapper(nsFile);
                functionMaps[nsFile.path] = mapper.map();
            });

            outputFunctionMap = functionMaps;
        }

        let outputCode = null;
        {
            let linesArray = [ ];   // Array<Array<String>>

            linesArray.push(prependLines);
            _.each(files, nsFile => {
                linesArray.push(nsFile.generatorLines);
            });
            linesArray.push(appendLines);

            outputCode = Array.prototype.concat.apply([ ], linesArray).join("\n");
        }

        callback(null, {
            code: outputCode,
            map:  outputSourceMap,
            functionMap: outputFunctionMap
        });

    } catch (err) {
        callback(err);
    }
}


uses(compiler)
{
    if (!this._parents) this._parents = [ ];
    this._parents.push(compiler);
}


compile(options, callback)
{
    let previousFiles   = this._files;
    let previousDefs    = this._defs;
    let previousOptions = this._options;
    let previousModel   = this._model;

    // Check options
    this._checkOptions(options);

    // Extract options which don't affect parse/build/compile stages
    //
    function extractOption(key) {
        let result = options[key];
        options[key] = null;
        return result;
    }

    function extractOptions(keys) {
        let extracted = { };
        _.each(keys, key => { extracted[key] = extractOption(key); });
        return extracted;
    }

    let optionsFiles              = extractOption("files");
    let optionsDefs               = extractOption("defs");
    let optionsState              = extractOption("state");
    let optionsIncludeState       = extractOption("include-state");
    let optionsIncludeBridged     = extractOption("include-bridged");

    if (extractOption("dev-print-log")) {
        Utils.enableLog();
    }

    let finishOptions = extractOptions([
        "include-map",
        "include-function-map",
        "prepend",
        "append",
        "source-map-file",
        "source-map-root"
    ]);

    // Extract options.files and convert to a map of path->NSFiles
    let files = this._extractFilesFromOptions(optionsFiles, previousFiles);
    options.files = null;

    let defs = optionsDefs ? this._extractFilesFromOptions(optionsDefs, previousDefs) : null;
    options.defs = null;

    // These options aren't extracted
    let optionsCheckTypes     = options["check-types"];
    let optionsOutputLanguage = options["output-language"];

    // If remaining options changed, invalidate everything
    //
    if (!_.isEqual(
        _.filter(options,         value => !_.isFunction(value) ),
        _.filter(previousOptions, value => !_.isFunction(value) )
    )) {
        previousOptions = options;
        previousModel   = new NSModel();

        Log("Calling needsAll() on all files");

        _.each(files, nsFile => {
            nsFile.needsAll();
        });

        this._checker = null;
    }

    let model = new NSModel();
    if (this._parents) {
        _.each(this._parents, parent => {
            if (parent._model) {
                model.loadState(parent._model.saveState());
            }
        });

    } else if (optionsState) {
        model.loadState(optionsState);
    } 

    if (options["squeeze"]) {
        model.getSymbolTyper().setupSqueezer(
            options["squeeze-start-index"] || 0,
            options["squeeze-end-index"]   || 0
        );
    }

    this._files   = files;
    this._options = options;
    this._defs    = defs;

    if (optionsCheckTypes && !this._checker) {
        this._checker = new Typechecker(options);
    }

    let outputCode          = null;
    let outputSourceMap     = null;
    let outputFunctionMap   = null;
    let typecheckerWarnings = null;

    async.waterfall([
        // Preprocess files
        callback => {
            this._preprocessFiles(files, options, callback);
        },

        // Parse files
        callback => {
            this._parseFiles(files, options, callback);
        },

        // Build model
        callback => {
            this._buildFiles(files, model, options, callback);
        },

        // Perform model diff
        callback => {
            if (!previousModel || previousModel.hasGlobalChanges(model)) {
                if (!previousModel) {
                    Log("No previous model, all files need generate");
                } else {
                    Log("Model has global changes, all files need generate");
                }

                _.each(files, nsFile => {
                    nsFile.needsGenerate();
                    nsFile.needsTypecheck();
                });

            } else {
                if (options["warn-unknown-selectors"]) {
                    let changedSelectors = previousModel.getChangedSelectorMap(model);

                    if (changedSelectors) {
                        _.each(files, nsFile => {
                            _.each(nsFile.uses.selectors, selectorName => {
                                if (changedSelectors[selectorName]) {
                                    Log(`${nsFile.path} needsGenerate due to selector: '${selectorName}'`);
                                    nsFile.needsGenerate();
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

        // Concatenate and map output
        callback => {
            if (optionsOutputLanguage != "none") {
                this._finish(files, finishOptions, (err, results) => {
                    if (results) {
                        outputCode        = results.code;
                        outputSourceMap   = results.map;
                        outputFunctionMap = results.functionMap;
                    }

                    callback(err);
                });
            } else {
                callback();
            }
        },

    ], err => {
        let errors = _.compact(_.map(files, nsFile => nsFile.getError()));

        // If we have an internal error, throw it now
        {
            if (err && err.name && !err.name.startsWith("NilScript")) {
                throw err;
            }

            _.each(errors, function(error) {
                if (!error.name.startsWith("NilScript")) {
                    throw error;
                }
            });
        }

        let warnings = _.map(files, nsFile => [
            nsFile.generatorWarnings,
        ]);

        warnings.push(typecheckerWarnings);

        let result = {
            code:        outputCode,
            map:         outputSourceMap,
            functionMap: outputFunctionMap,
            errors:      errors,
            warnings:    _.compact(_.flattenDeep(warnings))
        };

        if (optionsIncludeState) {
            result.state = model.saveState();
        }

        if (options["squeeze"]) {
            result.squeeze = model.getSqueezeMap();
        }

        if (optionsIncludeBridged) {
            result.bridged = model.saveBridged();
        }

        callback(err, result);
    });
}

}

