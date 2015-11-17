/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const fs      = require("fs");
const cp      = require("child_process");
const path    = require("path");
const dirname = require("path").dirname;
const _       = require("lodash");
const ts      = require("typescript");

const DefinitionMaker  = require("./DefinitionMaker");
const DiagnosticParser = require("./DiagnosticParser");
const Utils            = require("../utils")

module.exports = class Typechecker {


constructor(options)
{
    this._options = options;
    this._program = null;

    this._globalDefs = null;
    this._globalDefsSourceFile  = null;
    this._runtimeDefsSourceFile = null;
    this._libDefsSourceFile     = null;
}


invalidateGlobalState()
{
    this._globalDefs = null;
    this._globalDefsSourceFile = null;
}


getGlobalDefs()
{
    return this._globalDefs;
}


check(model, defs, files, callback)
{
    let options       = this._options;
    let development   = options["development"];
    let sourceFileMap = { };
    let contentsMap   = { };

    let tsOptions = {
        noImplicitAny: !!options["no-implicit-any"]
    };

    const defsSuffix      = "defs.d.ts";
    const codeSuffix      = "code.ts";

    const runtimeFileName = "$oj-runtime" + path.sep + defsSuffix;
    const globalFileName  = "$oj-global"  + path.sep + defsSuffix;
    const libFileName     = "$oj-lib"     + path.sep + defsSuffix;

    _.each(files, ojFile => {
        let codeKey = ojFile.path + path.sep + codeSuffix;
        let defsKey = ojFile.path + path.sep + defsSuffix;

        if (!ojFile.typecheckerCodeSourceFile) {
            ojFile.typecheckerCodeSourceFile = ts.createSourceFile(codeKey, ojFile.typecheckerCode, tsOptions.target);
        }

        if (!ojFile.typecheckerDefsSourceFile) {
            ojFile.typecheckerDefsSourceFile = ts.createSourceFile(defsKey, ojFile.typecheckerDefs, tsOptions.target);
        }

        sourceFileMap[codeKey] = ojFile.typecheckerCodeSourceFile;
        sourceFileMap[defsKey] = ojFile.typecheckerDefsSourceFile;

        contentsMap[codeKey] = ojFile.typecheckerCode;
        contentsMap[defsKey] = ojFile.typecheckerDefs;
    });

    _.each(defs, ojFile => {
        let defsKey = ojFile.path + path.sep + defsSuffix;

        if (!ojFile.typecheckerDefsSourceFile) {
            ojFile.typecheckerDefsSourceFile = ts.createSourceFile(defsKey, ojFile.contents, tsOptions.target);
        }

        sourceFileMap[defsKey] = ojFile.typecheckerDefsSourceFile;
        contentsMap[defsKey]   = ojFile.contents;
    });

    if (!this._globalDefsSourceFile) {
        this._globalDefs = (new DefinitionMaker(model)).getGlobalDefinitions();
        this._globalDefsSourceFile = ts.createSourceFile(globalFileName, this._globalDefs, tsOptions.target);
    }

    if (!this._runtimeDefsSourceFile) {
        let runtimeDefs = fs.readFileSync(dirname(__filename) + "/../../runtime/runtime.d.ts") + "\n";
        this._runtimeDefsSourceFile = ts.createSourceFile(runtimeFileName, runtimeDefs || "", tsOptions.target);
    }

    if (!this._libDefsSourceFile) {
        let libFileName = options["typescript-lib"] || "lib.d.ts";
        let libDefs = "";

        try {
            libDefs = fs.readFileSync(path.join(path.dirname(require.resolve("typescript")), libFileName)).toString();
        } catch (e) { }

        this._libDefsSourceFile = ts.createSourceFile(libFileName, libDefs, tsOptions.target);   
    }

    sourceFileMap[runtimeFileName] = this._runtimeDefsSourceFile;
    sourceFileMap[globalFileName]  = this._globalDefsSourceFile;
    sourceFileMap[libFileName]     = this._libDefsSourceFile;

    contentsMap[globalFileName] = this._globalDefs;

    let compilerHost = {
        getSourceFile:             (n, v) => sourceFileMap[n],
        writeFile:                 () => { },
        getDefaultLibFileName:     () => libFileName,
        useCaseSensitiveFileNames: () => false,
        getCanonicalFileName:      n  => n,
        getCurrentDirectory:       () => "",
        getNewLine:                () => "\n"
    };

    let program = ts.createProgram(_.keys(sourceFileMap), tsOptions, compilerHost, this._program);

    let diagnostics = [ ].concat(
        ts.getPreEmitDiagnostics(program),
        program.getSyntacticDiagnostics(),
        program.getSemanticDiagnostics(),
        program.getDeclarationDiagnostics()
    );

    let debugTmp = "/tmp/ojc.typechecker";
    let debugFilesToWrite = { };

    let warnings = (new DiagnosticParser()).getWarnings(model.getSymbolTyper(), diagnostics, filePath => {
        if (development) {
            let outFile = debugTmp + path.sep + filePath;
            debugFilesToWrite[filePath] = outFile;
            return outFile;

        } else {
            let components = filePath.split(path.sep);
            let last = components.pop();

            if (last == codeSuffix) {
                return components.join(path.sep);
            } else {
                return null;
            }
        }
    });

    if (development) {
        Utils.rmrf(debugTmp);

        _.each(debugFilesToWrite, (outFile, key) => {
            Utils.mkdirAndWriteFile(outFile, contentsMap[key]);
        });
    }

    this._program = program;

    callback(null, warnings);
}

}
