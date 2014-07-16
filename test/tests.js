//@opts = { }

var _      = require("lodash");
var assert = require("assert");
var cp     = require("child_process");
var fs     = require("fs");
var path   = require("path");

var OJError = require("../src/errors.js").OJError;
var oj      = require("../src/runtime.js");
var ojc     = require("../src/ojc");


function gatherTests(dir, callback)
{
    // From http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
    var walk = function(dir, done) {
        var results = [];

        var list = fs.readdirSync(dir);

        var pending = list.length;
        if (!pending) return done(null, results);

        list.forEach(function(file) {
            file = dir + "/" + file;

            var stat = fs.statSync(file);

            if (stat && stat.isDirectory()) {
                walk(file, function(err, res) {
                    results = results.concat(res);
                    if (!--pending) done(null, results);
                });
            } else {
                results.push(file);
                if (!--pending) done(null, results);
            }
        });
    };

    walk(dir, function(err, files) {
        var tests = [ ];

        _.each(files, function(file) {
            if (!file.match(/\.oj$/)) return;

            var fileTestCount = 0;
            var t;

            var makeTest = function() {
                fileTestCount++;

                t = {
                    file: file,
                    name: path.basename(file) + " #" + fileTestCount,
                    options: [ ],
                    error: null,
                    contents: [ ]
                };

                tests.push(t);
            };
            makeTest();

            var fileContents = fs.readFileSync(file);
            var fileLines    = fileContents.toString().split("\n");

            var fileLine, inMultilineComment, m;
            for (var i = 0, length = fileLines.length; i < length; i++) {
                fileLine = fileLines[i];

                if (fileLine.match("--------------------------------------------------")) {
                    makeTest();
                    continue;
                } 

                if (t) {
                    t.contents.push(fileLine);
                }
            }
        });

        _.each(tests, function(t) {
            var i = 1;

            _.each(t.contents, function(line) {
                var m;

                if (m = line.match(/\@name\s*\=?\s*(.*?)$/)) {
                    t.name = m[1].trim();
                } else if (m = line.match(/\@opts\s*\=?\s*(.*?)$/)) {
                    t.options.push(JSON.parse(m[1]));
                } else if (m = line.match(/\@error-no-line\s*\=?\s*(.*?)$/)) {
                    t.error = [ m[1].trim(), undefined ];
                } else if (m = line.match(/\@error\s*\=?\s*(.*?)$/)) {
                    t.error = [ m[1].trim(), i ];
                }

                i++;
            });

            t.contents = t.contents.join("\n");
        });

        tests = _.filter(tests, function(t) {
            return t.contents.trim().length > 0;
        });

        // Duplicate non-error tests to also --squeeze
        tests = _.each(tests, function(t) {
            if (t.options.length == 0) {
                t.options.push({ });
            }

            if (!t.error) {
                t.options.push({ "squeeze": true });
            } 
        });

        callback(err, tests);
    });
}


gatherTests(path.dirname(__filename), function(err, tests) {
    _.each(tests, function(t) {
        _.each(t.options, function(o) {
            var options = { };

            _.extend(options, o);
            options.files    = [ t.file     ];
            options.contents = [ t.contents ];

            ojc.ojc(options, function(err, result) {
                test(t.name, function() {
                    if (err) {
                        if (!t.error || (err.name != t.error[0]) || (err.line != t.error[1])) {
                            throw new Error("Expected: " +
                                t.error[0] + " on line " + t.error[1] +
                                ", actual: " +
                                err.name + " on line " + err.line
                            );

                        } else {
                            return;
                        }

                    } else if (t.error && !err) {
                        assert(false, t.name + " compiled, but shouldn't have");
                    }

                    var r = eval(result.code);
                    assert(r, "Test returned " + r);
                });
            });
        })
    });
});
