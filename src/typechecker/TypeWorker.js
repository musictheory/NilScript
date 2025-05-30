/*
    TypeWorker.js
    Main implementation of type checking, wraps the TypeScript compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _  from "lodash";
import fs from "node:fs";
import path from "node:path";

import { Worker, parentPort, workerData } from "node:worker_threads";

let ts; // Loaded dynamically

let sDocumentRegistryMap = new Map();
let sPromiseMap = new Map();

let sCachedFiles = new Map();
let sFilesToCheck = null;
let sFileMap = null;
let sOptions = null;


if (workerData == import.meta.url) {
    parentPort.on("message", async message => {
        let { type, args } = message;

        if (type == "prepare") {
            prepare(...args);

        } else if (type == "work") {
            let result, err;

            try {
                result = await typecheck(...args);
            } catch (e) {
                err = e;
            }
        
            parentPort.postMessage({ result, err });
        }
    });
}


function serializeDiagnosticMessageChain(dmc)
{
    return {
        messageText: dmc.messageText,
        category: dmc.category,
        code: dmc.code,
        next: _.map(dmc.next, child => serializeDiagnosticMessageChain(child))
    };
}


function serializeDiagnostic(diagnostic)
{
    let file = diagnostic?.file;
    if (!file) return null;

    let fileName = diagnostic?.file?.fileName;
    if (!fileName) return null;

    let { line, column } = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start) ?? { line: 0, column: 0 };
    line += 1;

    let flattened = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    let reason = flattened.split("\n")[0];
    let chain;
    
    if (_.isString(diagnostic.messageText)) {
        chain = {
            code:        diagnostic.code,
            category:    diagnostic.category,
            messageText: diagnostic.messageText
        };
    } else {
        chain = serializeDiagnosticMessageChain(diagnostic.messageText);
    }

    let result = {
        code: diagnostic.code,
        category: diagnostic.category,
        fileName, line, column,
        reason, flattened, chain
    };

    return result;
}


async function prepare(checkerID, groupID, inOptions)
{
    sPromiseMap.set(checkerID, new Promise(async (resolve, reject) => {
        try {
            if (!ts) ts = (await import("typescript")).default;

            let documentRegistry = sDocumentRegistryMap.get(groupID);

            if (!documentRegistry) {
                documentRegistry = ts.createDocumentRegistry();
                sDocumentRegistryMap.set(groupID, documentRegistry);
            }

            let { options, errors } = ts.convertCompilerOptionsFromJson(inOptions);

            const servicesHost = {
                getScriptFileNames: () => Array.from(sFileMap.keys()),
                getScriptVersion: fileName => {
                    return (sFileMap.get(fileName)?.version || 0).toString();
                },

                getScriptSnapshot: fileName => {
                    let file = sFileMap.get(fileName);
                    let contents = file?.contents;

                    if (!file) {
                        if (!fs.existsSync(fileName)) {
                            return null;

                        } else {
                            if (!sCachedFiles.get(fileName)) {
                                sCachedFiles.set(fileName, fs.readFileSync(fileName).toString());
                            }

                            contents = sCachedFiles.get(fileName);
                        }
                    }

                    return ts.ScriptSnapshot.fromString(contents);
                },
                
                
                resolveModuleNameLiterals: (moduleLiterals, containingFile, redirectedReference, options, containingSourceFile, reusedNames) => {
                    let result = moduleLiterals.map(literal => {
                        let dirname = path.dirname(containingFile);
                        let resolvedFileName = path.normalize(path.join(dirname, literal.text)) + ".ts";
                        return { resolvedModule: { resolvedFileName, extension: "ts",
                        resolvedUsingTsExtension: false } }
                    });
                    
                    return result;
                },

                getCurrentDirectory:    () => "",
                getCompilationSettings: () => options,
                getDefaultLibFileName:  options => ts.getDefaultLibFilePath(options),

                fileExists: fileName => { return sFileMap.has(fileName); },

                readFile: fileName => {
                    console.log("readFile", fileName);
                },
                
                readDirectory:   ts.sys.readDirectory,
                directoryExists: ts.sys.directoryExists,
                getDirectories:  ts.sys.getDirectories,
            };
    
            let service = ts.createLanguageService(servicesHost, documentRegistry);

            resolve(service);
        } catch (e) {
            reject(e);
        }
    }));
}


async function typecheck(checkerID, entries, filesToCheck)
{
    sFileMap  = new Map();
    sFilesToCheck = filesToCheck;

    for (let entry of entries) {
        sFileMap.set(entry.file, entry);
    }
    
    let service = await sPromiseMap.get(checkerID);
    
    let diagnostics = [ service.getCompilerOptionsDiagnostics() ];

    sFilesToCheck.map(fileToCheck => {
        diagnostics.push(
            service.getSyntacticDiagnostics(fileToCheck),
            service.getSemanticDiagnostics(fileToCheck)
        );
    });

    diagnostics = _.flattenDeep(diagnostics);
    diagnostics = _.map(diagnostics, diagnostic => serializeDiagnostic(diagnostic));
    diagnostics = _.filter(diagnostics);
    
    sFileMap  = null;
    sFilesToCheck = null;
    sOptions  = null;

    return diagnostics;
}


export class TypeWorker {

constructor()
{
    let url = import.meta.url;

    let worker = new Worker(new URL(import.meta.url), { workerData: url });
    worker.on("error", err => { console.error(err); });
    
    worker.unref();

    this._worker = worker;
    this._waitingJobs = [ ];
}


_sendNextJob()
{
    let job = this._waitingJobs[0];
    if (!job) return;
    
    let { resolve, reject, args } = job;

    this._worker.once("message", message => {
        let { result, err } = message;

        if (err) {
            reject(err)
        } else {
            resolve(result);
        }
        
        this._waitingJobs.shift();
        this._sendNextJob();
    });

    this._worker.postMessage({ type: "work", args });
}


prepare(checkerID, groupID, options)
{
    let args = [ checkerID, groupID, options ];
    this._worker.postMessage({ type: "prepare", args });
}


async work(checkerID, entries, filesToCheck)
{
    return new Promise((resolve, reject) => {
        let args = [ checkerID, entries, filesToCheck ];

        this._waitingJobs.push({ args, resolve, reject });

        if (this._waitingJobs.length == 1) {
            this._sendNextJob();
        }
    });
}

}
