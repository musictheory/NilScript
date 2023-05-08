/*
    TypeWorker.js
    Main implementation of type checking, wraps the TypeScript compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _  from "lodash";
import fs from "node:fs";

import { Worker, parentPort, workerData } from "node:worker_threads";

let ts; // Loaded dynamically

let sDocumentRegistry;
let sPromiseMap = { };

let sCachedFiles = { };
let sCodeKeys = null;
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


async function prepare(checkerID, inOptions)
{
    sPromiseMap[checkerID] = new Promise(async (resolve, reject) => {
        try {
            if (!ts) ts = (await import("typescript")).default;

            if (!sDocumentRegistry) {
                sDocumentRegistry = ts.createDocumentRegistry();
            }

            let { options, errors } = ts.convertCompilerOptionsFromJson(inOptions);

            const servicesHost = {
                getScriptFileNames: () => _.keys(sFileMap),
                getScriptVersion: fileName => {
                    return (sFileMap[fileName]?.version || 0).toString();
                },

                getScriptSnapshot: fileName => {
                    let file = sFileMap[fileName];
                    let contents = file?.contents;

                    if (!file) {
                        if (!fs.existsSync(fileName)) {
                            return null;

                        } else {
                            if (!sCachedFiles[fileName]) {
                                sCachedFiles[fileName] = fs.readFileSync(fileName).toString();
                            }

                            contents = sCachedFiles[fileName];
                        }
                    }

                    return ts.ScriptSnapshot.fromString(contents);
                },

                getCurrentDirectory:    () => process.cwd(),
                getCompilationSettings: () => options,
                getDefaultLibFileName:  options => ts.getDefaultLibFilePath(options),

                fileExists:      ts.sys.fileExists,
                readFile:        ts.sys.readFile,
                readDirectory:   ts.sys.readDirectory,
                directoryExists: ts.sys.directoryExists,
                getDirectories:  ts.sys.getDirectories,
            };
    
            let service = ts.createLanguageService(servicesHost, sDocumentRegistry);

            resolve(service);
        } catch (e) {
            reject(e);
        }
    });
    
    return sPromiseMap;
}


async function typecheck(checkerID, code, defs)
{
    sFileMap  = { };
    sCodeKeys = _.map(code, entry => entry.file);

    _.each([...code, ...defs ], entry => {
        sFileMap[entry.file] = entry;    
    });

    let service = await sPromiseMap[checkerID];
    
    let diagnostics = [ service.getCompilerOptionsDiagnostics() ];

    _.map(sCodeKeys, codeKey => {
        diagnostics.push(
            service.getSyntacticDiagnostics(codeKey),
            service.getSemanticDiagnostics(codeKey)
        );
    });

    diagnostics = _.flattenDeep(diagnostics);
    diagnostics = _.map(diagnostics, diagnostic => serializeDiagnostic(diagnostic));
    diagnostics = _.filter(diagnostics);

    sFileMap  = null;
    sCodeKeys = null;
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


prepare(checkerID, options)
{
    let args = [ checkerID, options ];
    this._worker.postMessage({ type: "prepare", args });
}


async work(checkerID, code, defs)
{
    return new Promise((resolve, reject) => {
        let args = [ checkerID, code, defs ];

        this._waitingJobs.push({ args, resolve, reject });

        if (this._waitingJobs.length == 1) {
            this._sendNextJob();
        }
    });
}

}
