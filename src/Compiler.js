/*
    Compiler.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _    from "lodash";
import fs   from "node:fs/promises";
import path from "node:path";

import { Builder        } from "./Builder.js";
import { FunctionMapper } from "./FunctionMapper.js";
import { Generator      } from "./Generator.js";
import { Parser         } from "./ast/Parser.js";
import { ScopeManager   } from "./ScopeManager.js";
import { SourceMapper   } from "./SourceMapper.js";
import { Squeezer       } from "./Squeezer.js";
import { Syntax         } from "./ast/Tree.js";
import { Utils          } from "./Utils.js";

import { NSCompileCallbackFile } from "./model/NSCompileCallbackFile.js";
import { CompilerFile          } from "./model/CompilerFile.js";
import { CompilerIssue         } from "./model/CompilerIssue.js";
import { Model                 } from "./model/Model.js";

import { Typechecker           } from "./typechecker/Typechecker.js";

const Log = Utils.log;


const sPublicOptions = [

    // Input options
    "files",                     // string or Object, files to compile
    "prepend",                   // string or string[], content/lines to prepend, not compiled
    "append",                    // string or string[], content/lines to append, not compiled
    "state",                     // Object, state from previous compile

    // Output options
    "output-language",           // Output language ('none' or 'es5' public, 'typechecker' for debugging only)
    "include-map",               // boolean, include 'map' key in results object
    "include-state",             // boolean, include 'state' key in results object
    "source-map-file",           // Output source map file name
    "source-map-root",           // Output source map root URL

    "before-compile",            // Function, callback to call per-file before the ns->js compile
    "after-compile",             // Function, callback to call per-file after the ns->js compile

    // Squeezer options
    "squeeze",                   // boolean, enable squeezer
    "squeeze-start-index",       // number, start index for squeezer
    "squeeze-end-index",         // number, end index for squeezer"
    "squeeze-builtins",          // string[], list of identifiers to not squeeze

    // Typechecker options
    "check-types",               // boolean, enable type checker
    "defs",                      // String or Object, additional typechecker defs
    "strict",                    // boolean
    "typescript-target",         // String
    "typescript-lib",            // String, specify alternate lib.d.ts file(s)
    "no-implicit-any",           // Boolean, disallow implicit any
    "no-implicit-returns",       // Boolean, disallow implicit returns
    "no-unreachable-code",       // Boolean, inverts tsc's "--allowUnreachableCode" option

    // Private / Development
    "dev-dump-tmp",              // Boolean, dump debug info to /tmp
    "dev-print-log",             // Boolean, print log to stdout
    "allow-private-options",     // Boolean, allow use of sPrivateOptions (see below)
];
let sPublicOptionsSet = new Set(sPublicOptions);


// Please file a GitHub issue if you wish to use these
const sPrivateOptions = [
    "additional-inlines",
    "include-bridged",
    "include-function-map"
];
let sPrivateOptionsSet = new Set(sPrivateOptions);


export class Compiler {


constructor()
{
    this._files   = [ ];
    this._defs    = [ ];
    this._options = { };

    this._model   = null;   
    this._parents = [ ];
    this._checker = null;
    this._checkerPromise = null;
}


_checkOptions(options)
{
    let allowPrivate = options["allow-private-options"];

    _.each(options, (value, key) => {
        if (                sPublicOptionsSet.has( key)) return;
        if (allowPrivate && sPrivateOptionsSet.has(key)) return;

//        throw new Error("Unknown Nyx option: " + key);
    });
}


_extractFilesFromOptions(optionsFiles, previousFiles)
{
    let existingMap = new Map();
    let outFiles = [ ];

    for (let file of previousFiles) {
        existingMap.set(file.path, file);
    }

    if (!Array.isArray(optionsFiles)) {
        throw new Error("options.files must be an array");
    }

    // The 'files' option can either be an Array of String file paths, or
    // an Array of Objects with the following keys:
    //        path: file path 
    //    contents: file contents
    //        time: file modification time
    //
    for (let f of optionsFiles) {
        let file, path, contents, time;

        if (_.isString(f)) {
            path = f;

        } else if (_.isObject(f)) {
            path     = f.path;
            contents = f.contents;
            time     = f.time || Date.now();

        } else {
            throw new Error("Each member of options.files must be a string or object");
        }

        if (!path) {
            throw new Error("No 'path' key in " + f);
        }

        file = existingMap.get(path) ?? new CompilerFile(path);

        if (contents && time) {
            file.updateWithContentsAndTime(contents, time);
        } else {
            file.updateFromDisk();
        }

        outFiles.push(file);
    }

    return outFiles;
}


_throwErrorInFiles(files)
{
    for (let file of files) {
        if (file.error) {
            throw file.error;
        }
    }
}


async _preprocessFiles(files, options)
{
    let beforeCompileCallback = options["before-compile"];

    files = files.filter(file => file.needsPreprocess);

    if (!beforeCompileCallback) {
        for (let file of files) {
            file.needsPreprocess = false;
        }

        return;
    }

    await Promise.all(files.map(async file => {
        let lines    = file.contents.split("\n");
        let warnings = [ ];

        let callbackFile = new NSCompileCallbackFile(file.path, lines, warnings);

        try {
            await beforeCompileCallback(callbackFile);
            file.contents = callbackFile._lines.join("\n");

            file.needsPreprocess = false;

        } catch (err) {
            Log(`${file.path} needsPreprocess due to error: '${err}'`);
            file.error = err;
        }
    }));

    this._throwErrorInFiles(files);
}


async _parseFiles(files)
{
    await Promise.all(files.map(async file => {
        if (!file.ast) {
            Log(`Parsing ${file.path}`);

            try { 
                file.ast = Parser.parse(file.contents);
                file.needsGenerate();

            } catch (inError) {
                let message = inError.description || inError.toString();
                message = message.replace(/$.*Line:/, "");

                file.needsParse();
                file.error = new CompilerIssue(message, {
                    line:   inError.loc?.line,
                    column: inError.loc?.column
                });
            }
        }
    }));

    this._throwErrorInFiles(files);
}


async _buildFiles(files, model)
{
    await Promise.all(files.map(async file => {
        try {
            if (!file.builder) {
                let builder = new Builder(file);
                builder.build();
                file.builder = builder;
            }

            file.builder.addToModel(model);

        } catch (err) {
            file.needsParse();
            file.error = err;
        }
    }));

    this._throwErrorInFiles(files);
}


async _fillImports(inOutFiles, model)
{
    let pastPaths = [ ];
    let filePaths = inOutFiles.map(f => f.path);

    for (let file of inOutFiles) {
        let importMap = new Map();

        for (let importName of file.imports) {
            let object = model.get(importName);
            if (!object) continue;
            
            let path = object.location.path;
            let importType = ScopeManager.ImportType.Past;

            if (path && filePaths.includes(path) && !pastPaths.includes(path)) {
                importType = ScopeManager.ImportType.Future;
            }

            importMap.set(importName, { object: object, importType: importType });
        }
        
        file.scopeManager.finish(importMap);

        pastPaths.push(file.path);
    }
}


async _reorderFiles(inOutFiles, model)
{
    let nameToDependentsMap = new Map();

    let addedFiles = new Set();
    let visitedFiles = new Set();
    let outFiles = [ ];

    for (let file of inOutFiles) {
        let imports = file.imports;
        let scopeManager = file.scopeManager;
        
        scopeManager.reset();
        
        for (let declaration of scopeManager.getTopLevelDeclarations()) {
            let superClassName = declaration?.object?.superClassName;

            if (superClassName && (imports.indexOf(superClassName) >= 0)) {
                let set = nameToDependentsMap.get(superClassName) ?? new Set();
                set.add(file);
                nameToDependentsMap.set(superClassName, set);            
            }
        }
    }

    // console.log("--- nameToDependentsMap");
    // for (let key of nameToDependentsMap.keys()) {
    //     console.log(`${key} -> [`);
    //     console.log(Array.from(nameToDependentsMap.get(key)).map(f => f.path).join(",\n"));
    //     console.log(`]`);
    // }
    // console.log("---");
    
    function sort(toSort, reference, direction = 1) {
        toSort.sort((a, b) => {
            let aIndex = reference.indexOf(a);
            let bIndex = reference.indexOf(b);

            return (aIndex - bIndex) * direction;
        });
        
        return toSort;
    }
    
    function visit(file) {
        if (addedFiles.has(file)) {
            return;
        }
        
        addedFiles.add(file);

        for (let exportName of file.exports) {
            let dependents = nameToDependentsMap.get(exportName) || new Set();
            
            for (let dependent of dependents) {
                visit(dependent);
            }
        }
        
        outFiles.unshift(file);
    }
    
    for (let file of inOutFiles.toReversed()) {
        visit(file);
    }
    
    sort(inOutFiles, outFiles, 1);
}


async _generateJavaScript(files, model, squeezer, options)
{
    let afterCompileCallback = options["after-compile"];

    await Promise.all(files.map(async file => {
        try {
            if (!file.generatedLines) {
                Log(`Generating ${file.path}`);

                let generator = new Generator(file, model, squeezer, options);
                let result    = generator.generate();

                file.generatedLines    = result.lines;
                file.generatedWarnings = result.warnings || [ ];

                if (afterCompileCallback) {
                    let callbackFile = new NSCompileCallbackFile(file.path, file.generatedLines, file.generatedWarnings);

                    await afterCompileCallback(callbackFile);

                    file.generatedLines    = callbackFile._lines;
                    file.generatedWarnings = callbackFile._warnings;
                }
            }

        } catch (err) {
            Log(`${file.path} needsGenerate due to error: '${err}'`);

            file.needsGenerate();
            file.error = err;
        }
    }));

    this._throwErrorInFiles(files);
}


async _finish(files, options)
{
    function getLines(arrayOrString) {
        if (Array.isArray(arrayOrString)) {
            return arrayOrString.flat(Infinity).join("\n").split("\n");
        } else if (typeof arrayOrString == "string") {
            return arrayOrString.split("\n");
        } else {
            return [ ];
        }
    }

    let prependLines = getLines( options["prepend"] );
    let appendLines  = getLines( options["append"] );
    
    let globalIdentifier = options["global-identifier"] ?? "__N$$__";
    
    // Add runtime if needed
    if (this._parents.length == 0) {
        let runtimeLines = (await fs.readFile(Utils.getRuntimePath()))
            .toString()
            .replaceAll("__N$$__", globalIdentifier.replaceAll("$", "$$$$"))
            .split("\n");

        prependLines.push(...runtimeLines);
    }
    
    // Add root variable and top-level IIFE
    {
        prependLines.push(
            `(function() { "use strict";`,
            `const N$$_ = globalThis[Symbol.for("${globalIdentifier}")];`
        );
        
        appendLines.splice(0, 0,
            `})();`        
        );
    }

    let outputSourceMap   = null;
    let outputFunctionMap = null;

    if (options["include-map"]) {
        let mapper = new SourceMapper(options["source-map-file"], options["source-map-root"]);

        mapper.add(null, prependLines);

        for (let file of files) {
            mapper.add(file.path, file.generatedLines);
        }
        
        mapper.add(null, appendLines);

        outputSourceMap = mapper.getSourceMap();
    }

    if (options["include-function-map"]) {
        let functionMaps = { };

        for (let file of files) {
            let mapper = new FunctionMapper(file);
            functionMaps[file.path] = mapper.map();
        }

        outputFunctionMap = functionMaps;
    }

    let outputCode = null;
    {
        let linesArray = [ ];   // Array<Array<String>>

        linesArray.push(prependLines);
        files.forEach(file => linesArray.push(file.generatedLines));
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

    let optionsFiles          = extractOption("files");
    let optionsDefs           = extractOption("defs");
    let optionsIncludeBridged = extractOption("include-bridged");

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

    // Extract options.files and convert to a map of path->CompilerFiles
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
        previousModel   = new Model();

        Log("Calling needsAll() on all files");

        for (let file of files) {
            file.needsAll();
        }

        this._checker = null;
        this._checkerPromise = null;
    }

    let parentModels    = [ ];
    let parentSqueezers = [ ];
    let parentCheckers  = [ ];

    for (let parent of this._parents) {
        if (parent._model)    parentModels.push(parent._model);
        if (parent._squeezer) parentSqueezers.push(parent._squeezer);
        if (parent._checker)  parentCheckers.push(parent._checker);
    }

    if (optionsCheckTypes && !this._checker) {
        this._checker = new Typechecker(parentCheckers, options);
    }

    let model = new Model(parentModels);
    let squeezer = null;

    if (options["squeeze"]) {
        squeezer = new Squeezer(
            parentSqueezers,
            options["squeeze-start-index"] || 0,
            options["squeeze-end-index"]   || 0,
            options["squeeze-builtins"]    || [ ]
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
        files.forEach(file => { file.error = null; });

        // Preprocess files
        await this._preprocessFiles(files, options);

        // Parse files
        await this._parseFiles(files);

        // Build model
        await this._buildFiles(files, model, squeezer);

        // Reorder files based on inheritance
        await this._reorderFiles(files, model);

        // Fill imports with model objects
        await this._fillImports(files, model);

        // Perform model diff
        if (!previousModel || previousModel.hasGlobalChanges(model)) {
            if (!previousModel) {
                Log("No previous model, all files need generate");
            } else {
                Log("Model has global changes, all files need generate");
            }

            files.forEach(file => file.needsGenerate());
        }

        // If we get here, our current model is valid.  Save it for next time
        this._model = model;
        this._squeezer = squeezer;

        // Run typechecker
        if (optionsCheckTypes) {
            this._checker.check(model, squeezer, defs, files);

            if (Typechecker.includeInCompileResults) {
                typecheckerWarnings = await this._checker.collectWarnings();
            }
        }

        // Run generator
        if (optionsOutputLanguage != "none") {
            await this._generateJavaScript(files, model, squeezer, options);
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

    let errors = files.map(file => file.error).filter(error => !!error);

    if (caughtError && !errors.includes(caughtError)) {
        errors.unshift(caughtError);
    }
    
    for (let error of errors) {
        if (!error instanceof CompilerIssue) {
            throw error;
        }
    }

    let warnings = files
        .map(file => file.generatedWarnings)
        .concat(typecheckerWarnings)
        .flat(Infinity)
        .filter(w => !!w);

    let result = {
        code:        outputCode,
        map:         outputSourceMap,
        functionMap: outputFunctionMap,
        errors:      errors,
        warnings:    warnings
    };

    if (options["squeeze"]) {
        result.squeeze = squeezer.getSqueezeMap();
    }

    if (optionsIncludeBridged) {
        result.bridged = model.saveBridged();
    }

    return result;
}

}

