/*
    Typechecker.js
    Main implementation of type checking, wraps the TypeScript compiler
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

    this._contentCache    = { };
    this._sourceFileCache = { };
}


_getSourceFile(key, contents)
{
    let result;

    if (this._contentCache[key] == contents) {
        result = this._sourceFileCache[key];

    } else {
        result = ts.createSourceFile(key, contents);

        this._sourceFileCache[key] = result;
        this._contentCache[key] = contents;
    }

    return result;
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
    let ignoreFileMap = { }; // Warnings from these files will be ignored.
    let toCheck       = [ ];

    let tsOptions = {
        noImplicitAny:        !!options["no-implicit-any"],
        noImplicitReturns:    !!options["no-implicit-returns"],
        allowUnreachableCode:  !options["no-unreachable-code"]
    };

    const defsSuffix      = "defs.d.ts";
    const codeSuffix      = "code.ts";

    const runtimeFileName = "$oj-runtime" + path.sep + defsSuffix;
    const globalFileName  = "$oj-global"  + path.sep + defsSuffix;
    const libFileName     = "$oj-lib"     + path.sep + defsSuffix;

    _.each(files, ojFile => {
        let codeKey = path.normalize(ojFile.path) + path.sep + codeSuffix;
        let defsKey = path.normalize(ojFile.path) + path.sep + defsSuffix;

        if (!ojFile.typecheckerDefs) {
            ojFile.typecheckerDefs = (new DefinitionMaker(model)).getFileDefinitions(ojFile);
        }

        sourceFileMap[codeKey] = this._getSourceFile(codeKey, ojFile.typecheckerCode);
        sourceFileMap[defsKey] = this._getSourceFile(defsKey, ojFile.typecheckerDefs);
        ignoreFileMap[defsKey] = true;
    });

    _.each(defs, ojFile => {
        let defsKey = ojFile.path + path.sep + defsSuffix;

        sourceFileMap[defsKey] = this._getSourceFile(defsKey, ojFile.contents);
    });

    if (!this._globalDefsSourceFile) {
        this._globalDefs = (new DefinitionMaker(model)).getGlobalDefinitions();
        this._globalDefsSourceFile = this._getSourceFile(globalFileName, this._globalDefs);
    }

    if (!this._runtimeDefsSourceFile) {
        let runtimeDefs = fs.readFileSync(dirname(__filename) + "/../../lib/runtime.d.ts") + "\n";
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

    let compilerHost = {
        getSourceFile:             (n, v) => sourceFileMap[n],
        writeFile:                 () => { },
        getDefaultLibFileName:     () => libFileName,
        useCaseSensitiveFileNames: () => false,
        getCanonicalFileName:      n  => n,
        getCurrentDirectory:       () => process.cwd(),
        getNewLine:                () => "\n"
    };

    let program = ts.createProgram(_.keys(sourceFileMap), tsOptions, compilerHost, this._program);

    let diagnostics = [ ].concat(
        ts.getPreEmitDiagnostics(program)
    );

    let debugTmp = "/tmp/ojc.typechecker";
    let debugFilesToWrite = { };

    let warnings = (new DiagnosticParser()).getWarnings(model.getSymbolTyper(), diagnostics, filePath => {
        if (development) {
            return debugTmp + path.sep + filePath;

        } else {
            if (ignoreFileMap[filePath]) {
                return null;
            } else {
                let components = filePath.split(path.sep);
                let last = components.pop();
                return components.join(path.sep);
            }
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

                var lineColumn  = diagnostic.file ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : { line: 0, column: 0 };

                return fileName + ":" + lineColumn.line + ":" + ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            }).join("\n");

            fs.writeFileSync(debugTmp + "/diagnostics", content);
        }

        if (allContents.length) {

            allContents.unshift(this._runtimeDefsSourceFile.text);

            fs.writeFileSync(debugTmp + "/all.ts", allContents.join("\n;\n"));

        }
    }

    this._program = program;

    callback(null, warnings);
}

}
