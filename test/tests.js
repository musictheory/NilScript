//@opts = { }

"use strict";

const _      = require("lodash");
const assert = require("assert");
const cp     = require("child_process");
const fs     = require("fs");
const path   = require("path");

const OJError   = require("../src/Errors.js").OJError;
const OJWarning = require("../src/Errors.js").OJWarning;
const ojc       = require("../lib/api");
const oj        = require("../lib/runtime");


class TestCase {

constructor(name, options, lines)
{
    this.name    = name;
    this.options = options;
    this.lines   = lines;

    this.expectedNoLineErrors = [ ];
    this.expectedErrorMap     = { };    // Line number to name
    this.expectedWarningMap   = { };    // Line number to name
    this.expectedTypecheckMap = { };    // Line number to code,quoted string

    this._parseLines();
}


_parseLines()
{
    let lineNumber = 1;

    _.each(this.lines, line => {
        let m;

        if (m = line.match(/\@error-no-line\s*\=?\s*(.*?)$/)) {
            this.expectedNoLineErrors.push( m[1].trim() );

        } else if (m = line.match(/\@error\s*\=?\s*(.*?)$/)) {
            this.expectedErrorMap[lineNumber] = m[1].trim();

        } else if (m = line.match(/\@warning\s*\=?\s*(.*?)$/)) {
            this.expectedWarningMap[lineNumber] = m[1].trim();

        } else if (m = line.match(/\@typecheck\s*\=?\s*(.*?)$/)) {
            this.expectedTypecheckMap[lineNumber] = m[1].trim();
        }

        lineNumber++;
    });
}


_checkResults(err, result)
{
    function checkMaps(expectedMap, actualMap, noun) {
        let lineNumbers = _.uniq([].concat(
            _.keys(expectedMap),
            _.keys(actualMap)
        )).sort();

        _.each(lineNumbers, lineNumber => {
            let expected = expectedMap[lineNumber];
            let actual   = actualMap[lineNumber];

            if (!expected && actual) {
                throw new Error(`Unexpected ${noun} on line ${lineNumber}: ${actual}`);
            } else if (!actual && expected) {
                throw new Error(`Expected ${noun} on line ${lineNumber}: ${expected}`);
            } else if (actual != expected) {
                throw new Error(`Expected ${expected} on line ${lineNumber}, saw ${actual}`);
            }
        });
    }

    let canRun = true;

    let actualNoLineErrors = [ ];
    let actualErrorMap     = { };
    let actualWarningMap   = { };
    let actualTypecheckMap = { };

    _.each(result.errors, error => {
        canRun = false;

        if (error.line) {
            actualErrorMap[error.line] = error.name;
        } else {
            actualNoLineErrors.push(error.name);
        }
    });

    _.each(result.warnings, warning => {
        canRun = false;

        if (warning.name == OJWarning.Typechecker) {
            let codeQuoted = [ warning.code ];

            warning.reason.replace(/'(.*?)'/g, function(a0, a1) {
                codeQuoted.push(a1);
            });

            actualTypecheckMap[warning.line] = codeQuoted.join(",");

        } else {
            actualWarningMap[warning.line] = warning.name;
        }
    });

    assert.deepEqual(actualNoLineErrors.sort(), this.expectedNoLineErrors.sort());

    checkMaps(this.expectedErrorMap,     actualErrorMap,     "error");
    checkMaps(this.expectedWarningMap,   actualWarningMap,   "warning");
    checkMaps(this.expectedTypecheckMap, actualTypecheckMap, "type check");

    if (canRun) {
        oj._reset();
        let r = eval(result.code);
        assert(r, "Test returned " + r);
    }
}


run()
{
    let options = { };

    _.extend(options, this.options);
    options.files = [ { path: "test.oj", contents: this.lines.join("\n") } ];

    let name = this.name;
    if (options.squeeze) name += " +squeeze";

    test(name, done => {
        try {
            ojc.compile(options, (err, result) => {
                try {
                    this._checkResults(err, result);
                    done();
                } catch (e) {
                    done(e);
                }
            });
        } catch (e) {
            done(e);
        }
    });
}

}


// From http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
function walkSync(dir)
{
    let results = [ ];

    _.each(fs.readdirSync(dir), function(name) {
        let file = dir + path.sep + name;
        let stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            results.push(walkSync(file));
        } else {
            results.push(file);
        }
    });

    return _.flatten(results);
}


function splitLines(inLines, separator)
{
    let outLines = [ ];
    let results  = [ ];

    _.each(inLines, inLine => {
        if (inLine.match(separator)) {
            results.push(outLines);
            outLines = [ ];
        } else {
            outLines.push(inLine);
        }
    });

    results.push(outLines);

    return results;
}


function gatherTestCases(dir)
{
    let nameLinesArray = [ ];

    // Suck up all *.oj files, split on long hyphen lines, save as nameLinesArray
    _.each(walkSync(dir), file => {
        if (!file.match(/\.oj$/)) return;

        let count     = 0;
        let dir       = file.split(path.sep).slice(-2).shift();
        let fileLines = fs.readFileSync(file).toString().split("\n");

        _.each(splitLines(fileLines, "----------------"), lines => {
            if (lines.length) {
                nameLinesArray.push({
                    name: dir + path.sep + path.basename(file) + (count > 1 ? " #" + count : ""),
                    lines: lines
                });

                count++;
            }
        });
    });

    let testCases = [ ];

    // Create TestCase objects from nameLine pairs.
    // @name and @opts are applied at this time
    //
    _.each(nameLinesArray, nameLines => {
        let name  = nameLines.name;
        let lines = nameLines.lines;

        let optionsArray = [ ];

        _.each(lines, function(line) {
            let m;

            if (m = line.match(/\@name\s*\=?\s*(.*?)$/)) {
                name = m[1].trim();
            } else if (m = line.match(/\@opts\s*\=?\s*(.*?)$/)) {
                optionsArray.push(JSON.parse(m[1]));
            }
        });

        if (!optionsArray.length) optionsArray.push({ });

        _.each(optionsArray, options => {
            testCases.push(new TestCase(name, options, lines));
        });
    });

    // Duplicate non-error tests 
    testCases = _.flatten(_.map(testCases, testCase => {
        if (testCase.expectedNoLineErrors.length  == 0 &&
            _.size(testCase.expectedErrorMap)     == 0 &&
            _.size(testCase.expectedWarningMap)   == 0 &&
            _.size(testCase.expectedTypecheckMap) == 0)
        {
            let options = _.clone(testCase.options);
            options.squeeze = true;
            return [ testCase, new TestCase(testCase.name, options, testCase.lines) ];

        } else {
            return testCase;
        }
    }));

    return testCases;
}


_.each(gatherTestCases(path.dirname(__filename)), testCase => {
    testCase.run();
});

