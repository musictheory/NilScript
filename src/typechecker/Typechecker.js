/*
    Typechecker.js
    Main implementation of type checking, wraps the TypeScript compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import fs   from "node:fs";
import path from "node:path";

import { CompilerIssue } from "../model/CompilerIssue.js";
import { Generator     } from "../Generator.js";
import { SymbolUtils   } from "../SymbolUtils.js";
import { TypeWorker    } from "./TypeWorker.js";
import { Utils         } from "../Utils.js";


let sNextCheckerID = 1;
let sNextGroupID = 1;
let sWorkerCount = 4;
let sWorkers;

let sRuntimeDefsContents;

let sDidRemoveDebugDirectory = false;

const DefsSuffix = "defs.d.ts";

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


constructor(parents, options)
{
    if (!sWorkers) {
        sWorkers = [ ];

        for (let i = 0; i < sWorkerCount; i++) {
            sWorkers.push(new TypeWorker());
        }
    }

    
    this._checkerID = sNextCheckerID++;
    this._groupID = parents?.[0]?._groupID ?? sNextGroupID++;
    this._parents = parents;
    this._options = options;
    this._nextWorkerIndex = 0;
    this._defsMap = new Map();
    this._codeMap = new Map();

    this._generatorOptions = {
        "output-language": "typechecker",
        "additional-inlines": options["additional-inlines"]
    };
    
    console.log(options["strict"]);

    let tsOptions = {
        noImplicitAny:        !!options["no-implicit-any"],
        noImplicitReturns:    !!options["no-implicit-returns"],
        
        strictNullChecks:     !!options["strict"],
        strictBindCallApply:  !!options["strict"],
        strictBuiltinIteratorReturn: !!options["strict"],
        strictFunctionTypes:    !!options["strict"],
    
        allowUnreachableCode:  !options["no-unreachable-code"],
        target:                 options["typescript-target"],
        lib:                    options["typescript-lib"]?.split(","),

        allowArbitraryExtensions: true,
        allowImportingTsExtensions: true,
        module: "bundler",
        moduleResolution: "bundler"
    };
    
    for (let i = 0; i < sWorkerCount; i++) {
        sWorkers[i].prepare(this._checkerID, this._groupID, tsOptions);
    }
}


_writeDebugInformation()
{
    let debugTmp = "/tmp/nilscript.typechecker";
    let usedPaths = new Set();

    function formatKey(key) {
        let result = key.replaceAll(/[ /]/g, "_");

        while (usedPaths.has(result)) {
            result = "_" + result;
        }

        usedPaths.add(result);
               
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

    for (let [ key, entry ] of this._defsMap) {
        fs.writeFileSync(defsPath + path.sep + formatKey(key), entry.contents);
    }
    
    for (let [ key, entry ] of this._codeMap) {
        fs.writeFileSync(codePath + path.sep + formatKey(key), entry.contents);
    }
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


_getGlobalDefinitions(model, squeezer)
{
    let lines = [ ];

    lines.push("declare class N$G_Globals {");
    
    for (let { name, params, annotation } of model.globalFunctions.values()) {
        /*
            Hack, right now global assert() is the only function in our sourcebase that needs
            a type predicate
        */
        if (name == "assert") {
            name = SymbolUtils.getGlobalIdentifier(name, squeezer);
            lines.push(`${name}(condition: unknown, msg?: string): asserts condition;`);
            continue;
        }
    
        name = SymbolUtils.getGlobalIdentifier(name, squeezer);

        let args = params.map(param => {
            let optional = param.optional ? "?" : "";
            return `${param.name}${optional}: ${param.annotation}`;
        }).join(",");

        lines.push(`${name}(${args}): ${annotation};`);
    }

    lines.push("}");

    return lines.join("\n");
}


_updateDefs(inModel, inSqueezer, inDefs, inFiles)
{
    let previousDefsMap = this._defsMap;
    let defsMap = new Map();
    
    for (let parent of this._parents) {
        // Our call to getGlobalDefinitions() will include globals inherited
        // from parent Models - we need to filter out the parent defs file to avoid
        // duplicates.
        //
        for (let [ key, value ] of parent._defsMap) {
            if (!key.startsWith(GlobalDefsPrefix)) {
                defsMap.set(key, value);
            }
        }
    }

    for (let nsFile of inDefs) {
        let defsKey = nsFile.path + path.sep + DefsSuffix;

        defsMap.set(defsKey, {
            file: defsKey,
            contents: nsFile.contents,
            version: nsFile.generatedVersion,
            original: nsFile.path
        });
    }
    
    // Make entry for globals
    {
        // Each global definition needs to have a unique name, else the
        // TypeScript cache may use the wrong one
        //
        let defsKey = `${GlobalDefsPrefix}.${this._checkerID}${path.sep}${DefsSuffix}`;
        
        let previous = previousDefsMap.get(defsKey);
        if (!previous) previous = { file: defsKey };
        
        let globalDefs = this._getGlobalDefinitions(inModel, inSqueezer);
        
        // NaN forces the callback block to always run
        //
        defsMap.set(defsKey, this._updateEntry(previous, NaN, () => globalDefs));
    }

    // Make entry for runtime.d.ts
    {
        if (!sRuntimeDefsContents) {
            let runtimeDefsFile = Utils.getProjectPath("lib/runtime.d.ts");
            sRuntimeDefsContents = fs.readFileSync(runtimeDefsFile) + "\n";
        }
        
        defsMap.set(RuntimeDefsKey, {
            file: RuntimeDefsKey,
            contents: sRuntimeDefsContents,
            version: 0
        });
    }

    this._defsMap = defsMap;
}
 

_updateCode(inModel, inSqueezer, inFiles)
{
    let previousCodeMap = this._codeMap;
    let codeMap = new Map();

    for (let parent of this._parents) {
        // Our call to getGlobalDefinitions() will include globals inherited
        // from parent Models - we need to filter out the parent defs file to avoid
        // duplicates.
        //
        for (let [ key, value ] of parent._codeMap) {
            let clonedValue = structuredClone(value);
            clonedValue.workerIndex = NaN;
            codeMap.set(key, clonedValue);
        }
    }

    for (let nsFile of inFiles) {
        let codeKey = path.normalize(nsFile.path + ".ts");

        let previous = previousCodeMap.get(codeKey);
        if (!previous) previous = { file: codeKey };
        
        let entry = this._updateEntry(previous, nsFile.generatedVersion, () => {
            try {
                let generator = new Generator(nsFile, inModel, inSqueezer, this._generatorOptions);
                return generator.generate().lines.join("\n");
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

        codeMap.set(codeKey, entry);
    }

    this._codeMap = codeMap;
}


_getWarnings(diagnostics, squeezer)
{
    let warnings = [ ];

    for (let diagnostic of diagnostics) {
        let { fileName, line, column, code, reason } = diagnostic;
        if (!fileName) continue;

        fileName = this._codeMap.get(fileName)?.original ??
                   this._defsMap.get(fileName)?.original ??
                   fileName;

        if (!fileName) continue;

        // Symbolicate reason string and remove ending colon/period
        reason = SymbolUtils.symbolicate(reason, squeezer).replace(/[\:\.]$/, "");

        let issue = new CompilerIssue(reason, {  line, column });
        issue.addFile(fileName);
        issue.code = code;

        warnings.push(issue);
    }

    return warnings;
}


_makeWorkerArgsArray(inModel)
{
    let code = Array.from(this._codeMap.values());
    let defs = Array.from(this._defsMap.values());

    return sWorkers.map((unused, index) => {
        let entriesToCheck = code.filter(entry => (entry.workerIndex == index));

        return {
            entries: [ ...code, ...defs ],
            active: entriesToCheck.map(entry => entry.file)
        }
    });
}


check(model, squeezer, defs, files)
{
    let options     = this._options;
    let development = options["dev-dump-tmp"];

    this._updateDefs(model, squeezer, defs, files);
    this._updateCode(model, squeezer, files);
    
    if (development) {
        this._writeDebugInformation();
    }

    this._warningsPromise = (async () => {
        await Promise.all(this._parents.map(parent => parent.collectWarnings()));
    
        let workerArgsArray = this._makeWorkerArgsArray(model);

        let diagnostics = await Promise.all(workerArgsArray.map((args, index) => {
            let worker = sWorkers[index];
            return worker.work(this._checkerID, args.entries, args.active);
        }))

        return this._getWarnings(diagnostics.flat(), squeezer);
    })();
}


async collectWarnings()
{
    return this._warningsPromise;
}


}
