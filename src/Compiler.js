/*
    Compiler.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _    from "lodash";
import fs   from "node:fs";
import path from "node:path";

import { Builder        } from "./Builder.js";
import { FunctionMapper } from "./FunctionMapper.js";
import { Generator      } from "./Generator.js";
import { NSError        } from "./Errors.js";
import { Parser         } from "./Parser.js";
import { SourceMapper   } from "./SourceMapper.js";
import { Syntax         } from "./Parser.js";
import { Utils          } from "./Utils.js";

import { NSCompileCallbackFile } from "./model/NSCompileCallbackFile.js";
import { NSFile                } from "./model/NSFile.js";
import { NSModel               } from "./model/NSModel.js";

import { Typechecker           } from "./typechecker/Typechecker.js";

const Log = Utils.log;


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
    "typescript-target",         // String
    "typescript-lib",            // String, specify alternate lib.d.ts file(s)
    "no-implicit-any",           // Boolean, disallow implicit any
    "no-implicit-returns",       // Boolean, disallow implicit returns
    "no-unreachable-code",       // Boolean, inverts tsc's "--allowUnreachableCode" option

    // Warnings
    "warn-global-no-type",       // Boolean, warn about missing type annotations on @globals
    "warn-this-in-methods",      // Boolean, warn about usage of 'this' in ns methods
    "warn-self-in-non-methods",  // Boolean, warn about usage of 'self' in non-methods
    "warn-unknown-ivars",        // Boolean, warn about unknown ivars
    "warn-unknown-selectors",    // Boolean, warn about usage of unknown selectors
    "warn-unused-privates",      // Boolean, warn about unused ivars

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


export class Compiler {


constructor()
{
    this._files   = null;
    this._options = null;
    this._defs    = null;
    this._model   = null;   
    this._parents = null;
    this._checker = null;
    this._checkerPromise = null;
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
        throw new Error("options.files must be an array");
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
            throw new Error("Each member of options.files must be a string or object");
        }

        if (!path) {
            throw new Error("No 'path' key in " + f);
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


_throwErrorInFiles(files)
{
    _.each(files, nsFile => {
        if (nsFile.error) {
            throw nsFile.error;
        }
    });
}


async _preprocessFiles(files, options)
{
    let beforeCompileCallback = options["before-compile"];

    files = _.filter(files, nsFile => nsFile.needsPreprocess);

    if (!beforeCompileCallback) {
        _.map(files, nsFile => {
            nsFile.needsPreprocess = false;
        });

        return;
    }

    await Promise.all(_.map(files, async nsFile => {
        let lines    = nsFile.contents.split("\n");
        let warnings = [ ];

        let callbackFile = new NSCompileCallbackFile(nsFile.path, lines, warnings);

        try {
            await beforeCompileCallback(callbackFile);
            nsFile.contents = callbackFile._lines.join("\n");

            nsFile.needsPreprocess = false;

        } catch (err) {
            Log(`${nsFile.path} needsPreprocess due to error: '${err}'`);
            nsFile.error = err;
        }
    }));

    this._throwErrorInFiles(files);
}


async _parseFiles(files, options)
{
    return Promise.all(_.map(files, async nsFile => {
        if (!nsFile.ast) {
            Log(`Parsing ${nsFile.path}`);

            try { 
                let sourceType = options["parser-source-type"] || "script";
                nsFile.ast = Parser.parse(nsFile.contents, { loc: true, sourceType: sourceType });

                nsFile.needsGenerate();

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
                nsFile.error = outError;
            }
        }
    }));

    this._throwErrorInFiles(files);
}


async _buildFiles(files, model, options)
{
    await Promise.all(_.map(files, async nsFile => {
        try {
            if (!nsFile.builder) {
                let builder = new Builder(options);
                builder.build(nsFile);
                nsFile.builder = builder;
            }

            nsFile.builder.addToModel(model);

        } catch (err) {
            nsFile.needsParse();
            nsFile.error = err;
        }
    }));

    this._throwErrorInFiles(files);

    model.prepare();
}


async _reorderFiles(inOutFiles, model, options)
{
    let files = inOutFiles.slice(0);
    inOutFiles.splice(0, inOutFiles.length);

    let remainingFiles = { };
    _.each(files, file => (remainingFiles[file.path] = file));

    let dependencies = { };

    _.each(model.classes, nsClass => {
        let classPath = nsClass.location.path;
        let superPath = nsClass.superclass?.location?.path;

        if (superPath && (superPath != classPath)) {
            let arr = dependencies[classPath] || [ ];
            arr.push(superPath);
            dependencies[classPath] = arr;
        }
    });

    function addFile(path, stack) {
        if (stack.includes(path)) {
            stack.push(path);
            throw new Error("Recursive class dependency detected: " + stack.join(","));
        }

        stack = [...stack, path];

        _.each(dependencies[path], dependency => {
            addFile(dependency, stack);
        });

        let file = remainingFiles[path];
        if (!file) return;

        remainingFiles[path] = null;
        inOutFiles.push(file);
    }

    _.each(files, file => {
        addFile(file.path, [ ]);
    });
}


async _generateJavaScript(files, model, options)
{
    let afterCompileCallback = options["after-compile"];

    await Promise.all(_.map(files, async nsFile => {
        try {
            if (!nsFile.generatedLines) {
                Log(`Generating ${nsFile.path}`);

                let generator = new Generator(nsFile, model, options);
                let result    = generator.generate();

                nsFile.generatedLines    = result.lines;
                nsFile.generatedWarnings = result.warnings || [ ];

                if (afterCompileCallback) {
                    let callbackFile = new NSCompileCallbackFile(nsFile.path, nsFile.generatedLines, nsFile.generatedWarnings);

                    await afterCompileCallback(callbackFile);

                    nsFile.generatedLines    = callbackFile._lines;
                    nsFile.generatedWarnings = callbackFile._warnings;
                }
            }

        } catch (err) {
            Log(`${nsFile.path} needsGenerate due to error: '${err}'`);

            nsFile.needsGenerate();
            nsFile.error = err;
        }
    }));

    this._throwErrorInFiles(files);
}


async _finish(files, options)
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

    let prependLines = getLines( options["prepend"] );
    let appendLines  = getLines( options["append"] );

    let outputSourceMap   = null;
    let outputFunctionMap = null;

    if (options["include-map"]) {
        let mapper = new SourceMapper(options["source-map-file"], options["source-map-root"]);

        mapper.add(null, prependLines);

        _.each(files, nsFile => {
            mapper.add(nsFile.path, nsFile.generatedLines);
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
            linesArray.push(nsFile.generatedLines);
        });
        linesArray.push(appendLines);

        outputCode = Array.prototype.concat.apply([ ], linesArray).join("\n");
    }

    return {
        code: outputCode,
        map:  outputSourceMap,
        functionMap: outputFunctionMap
    };
}


uses(compiler)
{
    if (!this._parents) this._parents = [ ];
    this._parents.push(compiler);
}


async collectTypecheckerWarnings()
{
    return this._checker?.collectWarnings();
}


async compile(options)
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
        this._checkerPromise = null;
    }

    if (optionsCheckTypes && !this._checker) {
        this._checker = new Typechecker(options);
    }

    let model = new NSModel();

    if (this._parents) {
        let parentCheckers = [ ];

        _.each(this._parents, parent => {
            if (parent._model) {
                model.loadState(parent._model.saveState());
            }

            if (parent._checker) {
                parentCheckers.push(parent._checker);
            }
        });

        if (this._checker) {
            this._checker.parents = parentCheckers;
        }

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

    let outputCode          = null;
    let outputSourceMap     = null;
    let outputFunctionMap   = null;
    let typecheckerWarnings = null;

    let caughtError = null;

    try {
        // Clear errors from last compile
        _.each(files, nsFile => {
            nsFile.error = null;
        });

        // Preprocess files
        await this._preprocessFiles(files, options);

        // Parse files
        await this._parseFiles(files, options);

        // Build model
        await this._buildFiles(files, model, options);

        // Reorder files
        await this._reorderFiles(files, model, options);

        // Perform model diff
        if (!previousModel || previousModel.hasGlobalChanges(model)) {
            if (!previousModel) {
                Log("No previous model, all files need generate");
            } else {
                Log("Model has global changes, all files need generate");
            }

            _.each(files, nsFile => nsFile.needsGenerate());

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

        // Run typechecker
        if (optionsCheckTypes) {
            this._checker.check(model, defs, files);

            if (Typechecker.includeInCompileResults) {
                typecheckerWarnings = await this._checker.collectWarnings();
            }
        }

        // Run generator
        if (optionsOutputLanguage != "none") {
            await this._generateJavaScript(files, model, options);
        }

        // Concatenate and map output
        if (optionsOutputLanguage != "none") {
            let results = await this._finish(files, finishOptions);

            if (results) {
                outputCode        = results.code;
                outputSourceMap   = results.map;
                outputFunctionMap = results.functionMap;
            }
        }

    } catch (err) {
        caughtError = err;
    }

    let errors = _.compact(_.map(files, nsFile => nsFile.error));

    if (caughtError && !errors.includes(caughtError)) {
        errors.unshift(caughtError);
    }

    _.each(errors, error => {
        if (!error.name || !error.name.startsWith("NilScript")) {
            throw error;
        }
    });

    let warnings = _.map(files, nsFile => [
        nsFile.generatedWarnings,
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

    return result;
}

}

