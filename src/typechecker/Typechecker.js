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
import { Utils            } from "../Utils.js";

let sInstanceMap = { };

let sNextCheckerID = 1;
let sWorkerCount = 4;
let sWorkers;


export class Typechecker {


constructor(options)
{
    if (!sWorkers) {
        sWorkers = [ ];

        for (let i = 0; i < sWorkerCount; i++) {
            sWorkers.push(new TypeWorker());
        }
    }
    
    this._checkerID = sNextCheckerID++;
    this._options = options;
    this._workerIndexMap = { };
    this._nextWorkerIndex = 0;

    options = {
        noImplicitAny:        !!options["no-implicit-any"],
        noImplicitReturns:    !!options["no-implicit-returns"],
        allowUnreachableCode:  !options["no-unreachable-code"],
        lib:                    options["typescript-lib"]?.split(",")
    };
        
    for (let i = 0; i < sWorkerCount; i++) {
        sWorkers[i].prepare(this._checkerID, options);
    }
}


_makeWorkerArgsArray(inModel, inDefs, inFiles)
{
    let allCode  = [ ];
    let allDefs  = [ ];

    const defsSuffix = "defs.d.ts";
    const codeSuffix = "code.ts";

    _.each(inFiles, nsFile => {
        let codeKey = path.normalize(nsFile.path) + path.sep + codeSuffix;
        let defsKey = path.normalize(nsFile.path) + path.sep + defsSuffix;

        if (!nsFile.typecheckerDefs) {
            nsFile.typecheckerDefs = (new DefinitionMaker(inModel)).getFileDefinitions(nsFile);
        }
        
        let workerIndex = this._workerIndexMap[codeKey];
        if (workerIndex === undefined) {
            workerIndex = this._nextWorkerIndex;
            this._nextWorkerIndex = (workerIndex + 1) % sWorkerCount;
            this._workerIndexMap[codeKey] = workerIndex;
        }
        
        allCode.push({
            file: codeKey,
            contents: nsFile.typecheckerCode,
            version: nsFile.version,
            original: nsFile.path,
            workerIndex
        });

        allDefs.push({
            file: defsKey,
            contents: nsFile.typecheckerDefs,
            version: nsFile.version,
        });
    });

    _.each(inDefs, nsFile => {
        let defsKey = nsFile.path + path.sep + defsSuffix;

        allDefs.push({
            file: defsKey,
            contents: nsFile.contents,
            version: nsFile.version,
            original: nsFile.path
        });
    });
    
    // Make entry for globals
    {
        let globalDefs = (new DefinitionMaker(inModel)).getGlobalDefinitions();
        
        allDefs.push({
            file: `N$-global${path.sep}${defsSuffix}`,
            contents: globalDefs,
            version: 0
        });
    }

    // Make entry for runtime.d.ts
    {
        if (!this._runtimeDefsContents) {
            let runtimeDefsFile = Utils.getProjectPath("lib/runtime.d.ts");
            this._runtimeDefsContents = fs.readFileSync(runtimeDefsFile) + "\n";
        }
        
        allDefs.push({
            file: `N$-runtime${path.sep}${defsSuffix}`,
            contents: this._runtimeDefsContents,
            version: 0
        });
    }

    return _.map(sWorkers, (unused, index) => {
        return {
            code: _.filter(allCode, code => (code.workerIndex == index)),
            defs: allDefs
        }
    });
}


async check(model, defs, files)
{
    let options         = this._options;
    let development     = options["dev-dump-tmp"];
    let originalFileMap = { };

    let workerArgsArray = this._makeWorkerArgsArray(model, defs, files);
    
    let diagnostics = _.flatten(
        await Promise.all(_.map(workerArgsArray, (args, index) => {
            let worker = sWorkers[index];
            return worker.work(this._checkerID, args.code, args.defs);
        }))
    );


    let debugTmp = "/tmp/nilscript.typechecker";
    let debugFilesToWrite = { };

    let warnings = (new DiagnosticParser(model)).getWarnings(diagnostics, filePath => {
        if (development) {
            return debugTmp + path.sep + filePath;
        } else {
            if (filePath in originalFileMap) {
                return originalFileMap[filePath];
            }

            return filePath;
        }
    });

    if (development) {
        Utils.rmrf(debugTmp);

        let allContents = [ ];

        _.each(this._contentCache, (value, key) => {
            Utils.mkdirAndWriteFile(debugTmp + path.sep + key, this._contentCache[key]);
            allContents.push(this._contentCache[key]);
        });
 
        if (diagnostics.length) {
            let content = _.map(diagnostics, diagnostic => {
                let fileName = diagnostic && diagnostic.file && diagnostic.file.fileName;
                if (!fileName) return "";

                let lineColumn  = diagnostic.file ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : { line: 0, column: 0 };

                return fileName + ":" + lineColumn.line + ":" + ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            }).join("\n");

            fs.writeFileSync(debugTmp + "/diagnostics", content);
        }

        if (allContents.length) {

            allContents.unshift(this._runtimeDefsSourceFile.text);

            fs.writeFileSync(debugTmp + "/all.ts", allContents.join("\n;\n"));

        }
    }

    return warnings;
}

}
