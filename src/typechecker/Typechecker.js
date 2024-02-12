/*
    Typechecker.js
    Main implementation of type checking, wraps the TypeScript compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _    from "lodash";

import fs   from "node:fs";
import path from "node:path";

import { DefinitionMaker  } from "./DefinitionMaker.js";
import { DiagnosticParser } from "./DiagnosticParser.js";
import { TypeWorker       } from "./TypeWorker.js";
import { Generator        } from "../Generator.js";
import { Utils            } from "../Utils.js";


let sNextCheckerID = 1;
let sWorkerCount = 4;
let sWorkers;

let sRuntimeDefsContents;

let sDidRemoveDebugDirectory = false;

const DefsSuffix     = "defs.d.ts";
const CodeSuffix     = "code.ts";

const GlobalDefsPrefix = `N$-global`;
const RuntimeDefsKey   = `N$-runtime${path.sep}${DefsSuffix}`;


export function tuneTypecheckerPerformance(includeInCompileResults, workerCount)
{
    if (sWorkers) {
        throw new Error("tuneTypecheckerPerformance() must be called before any call to compile()");
    }
    
    Typechecker.includeInCompileResults = includeInCompileResults;
    sWorkerCount = (workerCount > 0) ? workerCount : 4;
}


export class Typechecker {

static includeInCompileResults = true;


constructor(options)
{
    if (!sWorkers) {
        sWorkers = [ ];

        for (let i = 0; i < sWorkerCount; i++) {
            sWorkers.push(new TypeWorker());
        }
    }
    
    this.parents = null;
    
    this._checkerID = sNextCheckerID++;
    this._options = options;
    this._nextWorkerIndex = 0;
    this._defsMap = { };
    this._codeMap = { };

    this._generatorOptions = {
        "output-language": "typechecker",
        "additional-inlines": options["additional-inlines"]
    };

    let tsOptions = {
        noImplicitAny:        !!options["no-implicit-any"],
        noImplicitReturns:    !!options["no-implicit-returns"],
        allowUnreachableCode:  !options["no-unreachable-code"],
        target:                 options["typescript-target"],
        lib:                    options["typescript-lib"]?.split(",")
    };
        
    for (let i = 0; i < sWorkerCount; i++) {
        sWorkers[i].prepare(this._checkerID, tsOptions);
    }
}


_writeDebugInformation()
{
    let debugTmp = "/tmp/nilscript.typechecker";
    let usedPaths = { };

    function formatKey(key) {
        let result = key.replaceAll(/[ /]/g, "_");

        while (usedPaths[result]) {
            result = "_" + result;
        }

        usedPaths[result] = true; 
               
        return result;
    }

    if (!sDidRemoveDebugDirectory) {
        fs.rmSync(debugTmp, { recursive: true, force: true });
        sDidRemoveDebugDirectory = true;
    }
    
    let basePath = debugTmp + path.sep + this._checkerID;
    let codePath = basePath + path.sep + "code";
    let defsPath = basePath + path.sep + "defs";
    
    fs.mkdirSync(codePath, { recursive: true });
    fs.mkdirSync(defsPath, { recursive: true });

    _.each(this._defsMap, (entry, key) => {
        fs.writeFileSync(defsPath + path.sep + formatKey(key), entry.contents);
    });
    
    _.each(this._codeMap, (entry, key) => {
        fs.writeFileSync(codePath + path.sep + formatKey(key), entry.contents);
    });
}


_updateEntry(previous, inVersion, callback)
{
    let entry = {
        file:      previous.file,
        contents:  previous.contents  ?? null,
        inVersion: previous.inVersion ?? NaN,
        version:   previous.version   ?? 1
    };

    if (entry.inVersion != inVersion) {
        let contents = callback();

        if (contents != entry.contents) {
            entry.contents = contents;
            entry.version++;                
        }
        
        entry.inVersion = inVersion;
    }
    
    return entry;
}


_updateDefs(inModel, inDefs, inFiles)
{
    let previousDefsMap = this._defsMap;
    let defsMap = { };
    
    _.each(this.parents, parent => {
        // Our call to getGlobalDefinitions() will include globals inherited
        // from parent Models - we need to filter out the parent defs file to avoid
        // duplicates.
        //
        _.each(parent._defsMap, (value, key) => {
            if (!key.startsWith(GlobalDefsPrefix)) {
                defsMap[key] = value;
            }
        });
    });
    
    _.each(inFiles, nsFile => {
        let defsKey = path.normalize(nsFile.path) + path.sep + DefsSuffix;

        let previous = previousDefsMap[defsKey];
        if (!previous) previous = { file: defsKey };

        defsMap[defsKey] = this._updateEntry(previous, nsFile.generatedVersion, () => {
            return (new DefinitionMaker(inModel)).getFileDefinitions(nsFile);
        });
    });

    _.each(inDefs, nsFile => {
        let defsKey = nsFile.path + path.sep + DefsSuffix;

        defsMap[defsKey] = {
            file: defsKey,
            contents: nsFile.contents,
            version: nsFile.generatedVersion,
            original: nsFile.path
        };
    });
    
    // Make entry for globals
    {
        // Each global definition needs to have a unique name, else the
        // TypeScript cache may use the wrong one
        //
        let defsKey = `${GlobalDefsPrefix}.${this._checkerID}${path.sep}${DefsSuffix}`;
        
        let previous = previousDefsMap[defsKey];
        if (!previous) previous = { file: defsKey };
        
        // NaN forces the callback block to always run
        //
        defsMap[defsKey] = this._updateEntry(previous, NaN, () => {
            return (new DefinitionMaker(inModel)).getGlobalDefinitions();
        });
    }

    // Make entry for runtime.d.ts
    {
        if (!sRuntimeDefsContents) {
            let runtimeDefsFile = Utils.getProjectPath("lib/runtime.d.ts");
            sRuntimeDefsContents = fs.readFileSync(runtimeDefsFile) + "\n";
        }
        
        defsMap[RuntimeDefsKey] = {
            file: RuntimeDefsKey,
            contents: sRuntimeDefsContents,
            version: 0
        };
    }

    this._defsMap = defsMap;
}
 

_updateCode(inModel, inFiles)
{
    let previousCodeMap = this._codeMap;
    let codeMap = { };

    _.each(inFiles, nsFile => {
        let codeKey = path.normalize(nsFile.path) + path.sep + CodeSuffix;

        let previous = previousCodeMap[codeKey];
        if (!previous) previous = { file: codeKey };
        
        let entry = this._updateEntry(previous, nsFile.generatedVersion, () => {
            try {
                let generator = new Generator(nsFile, inModel, this._generatorOptions);
                return "export {};" + generator.generate().lines.join("\n");
            } catch (err) {
                nsFile.error = err;            
                throw err;
            }
        });

        let workerIndex = previous.workerIndex;
        
        if (workerIndex === undefined) {
            workerIndex = this._nextWorkerIndex;
            this._nextWorkerIndex = (workerIndex + 1) % sWorkerCount;
        }

        entry.workerIndex = workerIndex;
        entry.original = nsFile.path;

        codeMap[codeKey] = entry;
    });

    this._codeMap = codeMap;
}


_makeWorkerArgsArray(inModel)
{
    let code = _.values(this._codeMap);
    let defs = _.values(this._defsMap);

    return _.map(sWorkers, (unused, index) => {
        return {
            code: _.filter(code, entry => (entry.workerIndex == index)),
            defs: defs
        }
    });
}


check(model, defs, files)
{
    let options         = this._options;
    let development     = options["dev-dump-tmp"];
    let originalFileMap = { };
    
    let start = Date.now();

    this._updateDefs(model, defs, files);
    this._updateCode(model, files);
    
    if (development) {
        this._writeDebugInformation();
    }

    this._warningsPromise = (async () => {
        await Promise.all(_.map(this.parents, parent => parent.collectWarnings()));
    
        let workerArgsArray = this._makeWorkerArgsArray(model, defs, files);

        let diagnostics = _.flatten(
            await Promise.all(_.map(workerArgsArray, (args, index) => {
                let worker = sWorkers[index];
                return worker.work(this._checkerID, args.code, args.defs);
            }))
        );

        let warnings = (new DiagnosticParser(model)).getWarnings(diagnostics, filePath => {
            if (development) {
                let debugTmp = "/tmp/nilscript.typechecker";
                return debugTmp + path.sep + filePath;
            } else {
                return this._codeMap[filePath]?.original ??
                       this._defsMap[filePath]?.original ??
                       filePath;
            }
        });

        return warnings;
    })();
}


async collectWarnings()
{
    return this._warningsPromise;
}


}
