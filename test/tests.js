//@opts = { }

import assert from "assert";

import fs     from "node:fs";
import path   from "node:path";

import nsc from "../lib/api.js";
import { NSWarning } from "../src/Errors.js";
import { Utils     } from "../src/Utils.js";


const SqueezeBuiltinObjects = [
    globalThis, assert,
    Array,  Array.prototype,
    Number, Number.prototype,
];

let SqueezeBuiltins = null;


class TestCase {

constructor(name, options, lines)
{
    this.name    = name;
    this.options = options;
    this.lines   = lines;

    this.expectedNoLineErrors = [ ];
    this.expectedErrorMap     = new Map();    // Line number to name
    this.expectedWarningMap   = new Map();    // Line number to name

    this._parseLines();
}


_parseLines()
{
    let lineNumber = 1;

    for (let line of this.lines) {
        let m;

        if (m = line.match(/\@error-no-line\s*\=?\s*(.*?)$/)) {
            this.expectedNoLineErrors.push( m[1].trim() );

        } else if (m = line.match(/\@error\s*\=?\s*(.*?)$/)) {
            this.expectedErrorMap.set(lineNumber, m[1].trim());

        } else if (m = line.match(/\@warning\s*\=?\s*(.*?)$/)) {
            this.expectedWarningMap.set(lineNumber, m[1].trim());
        }


        lineNumber++;
    }
}


_checkResults(result)
{
    function checkMaps(expectedMap, actualMap, noun) {
    
        for (let [ lineNumber, expected ] of expectedMap) {
            let actual = actualMap.get(lineNumber);

            if (expected && !actual) {
                throw new Error(`Expected ${noun} on line ${lineNumber}: ${expected}`);
            } else if (expected != actual) {
                throw new Error(`Expected ${expected} on line ${lineNumber}, saw ${actual}`);
            }
        }
        
        for (let [ lineNumber, actual ] of actualMap) {
            let expected = expectedMap.get(lineNumber);

            if (!expected) {
                throw new Error(`Unexpected ${noun} on line ${lineNumber}: ${actual}`);
            }
        }
    }

    let canRun = true;

    let actualNoLineErrors = [ ];
    let actualErrorMap     = new Map();
    let actualWarningMap   = new Map();

    for (let error of result.errors) {
        canRun = false;

        if (error.line) {
            actualErrorMap.set(error.line, error.name);
        } else {
            actualNoLineErrors.push(error.name);
        }
    }

    for (let warning of result.warnings) {
        canRun = false;

        if (warning.name != NSWarning.Typechecker) {
            actualWarningMap.set(warning.line, warning.name);
        }
    }

    assert.deepEqual(actualNoLineErrors.sort(), this.expectedNoLineErrors.sort());

    checkMaps(this.expectedErrorMap,   actualErrorMap,   "error");
    checkMaps(this.expectedWarningMap, actualWarningMap, "warning");

    if (canRun) {
        N$$_._r();

        let r = eval(result.code);
        if (r === false) {
            assert(r, "Test returned " + r);
        }
    }
}


run()
{
    let options = Object.assign({ }, this.options);

    options.files = [ { path: "test.ns", contents: this.lines.join("\n") } ];

    let name = this.name;
    if (options.squeeze) name += " +squeeze";

    test(name, async () => {
        this._checkResults(await nsc.compile(options));
    });
}

}


// From http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
function walkSync(dir)
{
    let results = [ ];

    for (let name of fs.readdirSync(dir)) {
        let file = dir + path.sep + name;
        let stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            results.push(walkSync(file));
        } else {
            results.push(file);
        }
    }

    return results.flat();
}


function splitLines(inLines, separator)
{
    let outLines = [ ];
    let results  = [ ];

    for (let inLine of inLines) {
        if (inLine.match(separator)) {
            results.push(outLines);
            outLines = [ ];
        } else {
            outLines.push(inLine);
        }
    }

    results.push(outLines);

    return results;
}


function gatherTestCases(dir)
{
    let nameLinesArray = [ ];

    // Suck up all *.ns files, split on long hyphen lines, save as nameLinesArray
    for (let file of walkSync(dir)) {
        if (!file.match(/\.ns$/)) continue;

        let count     = 0;
        let dir       = file.split(path.sep).slice(-2).shift();
        let fileLines = fs.readFileSync(file).toString().split("\n");

        for (let lines of splitLines(fileLines, "----------------")) {
            if (lines.length) {
                nameLinesArray.push({
                    name: dir + path.sep + path.basename(file) + (count > 1 ? " #" + count : ""),
                    lines: lines
                });

                count++;
            }
        }
    }

    let testCases = [ ];

    // Create TestCase objects from nameLine pairs.
    // @name and @opts are applied at this time
    //
    for (let { name, lines } of nameLinesArray) {
        let optionsArray = [ ];

        for (let line of lines) {
            let m;

            if (m = line.match(/\@name\s*\=?\s*(.*?)$/)) {
                name = m[1].trim();
            } else if (m = line.match(/\@opts\s*\=?\s*(.*?)$/)) {
                optionsArray.push(JSON.parse(m[1]));
            }
        }

        if (!optionsArray.length) optionsArray.push({ });

        for (let options of optionsArray) {
            testCases.push(new TestCase(name, options, lines));
        }
    }

    // Duplicate non-error tests 
    testCases = testCases.flatMap(testCase => {
        if (
            testCase.expectedNoLineErrors.length  == 0 &&
            testCase.expectedErrorMap.size        == 0 &&
            testCase.expectedWarningMap.size      == 0 &&
            testCase.options.squeeze == false
        ) {
            let options = structuredClone(testCase.options);

            if (!SqueezeBuiltins) {
                SqueezeBuiltins = [ globalThis["N$$"], ...SqueezeBuiltinObjects ].flatMap(
                    o => o ? Object.getOwnPropertyNames(o) : [ ]
                );
            }

            options["squeeze"] = true;
            options["squeeze-builtins"] = SqueezeBuiltins;
            
            return [ testCase, new TestCase(testCase.name, options, testCase.lines) ];

        } else {
            return testCase;
        }
    });

    return testCases;
}

// Add assert and nilscript to global scope
globalThis.assert = assert;
eval(fs.readFileSync(nsc.getRuntimePath()).toString());

for (let testCase of gatherTestCases(Utils.getProjectPath("test"))) {
    testCase.run();
}

