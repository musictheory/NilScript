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

            var components = file.split(path.sep);
            var dir = components.slice(-2).shift();

            var makeTest = function() {
                fileTestCount++;

                t = {
                    file: file,
                    name: dir + path.sep + path.basename(file) + (fileTestCount > 1 ? " #" + fileTestCount : ""),
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
                } else if (m = line.match(/\@warning\s*\=?\s*(.*?)$/)) {
                    t.error = [ m[1].trim(), i ];
                } else if (m = line.match(/\@typecheck\s*\=?\s*(.*?)$/)) {
                    if (!t.typecheck) t.typecheck = { };
                    t.typecheck[i] = m[1].trim();
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
            if (t.typecheck) {
                t.options.push({ "output-language": "none", "check-types": true });
            } else if (t.options.length == 0) {
                t.options.push({ });
            }

            if (!t.error && !t.warning && !t.typecheck) {
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
            options.files = [ { path: t.file, contents: t.contents } ];

            ojc.compile(options, function(err, result) {
                var name = t.name;
                if (options.squeeze)         name += " +squeeze";
                if (options["inline-const"]) name += " +const";
                if (options["inline-enum"])  name += " +enum";

                test(name, function() {
                    if (t.typecheck) {
                        var remaining = _.clone(t.typecheck);

                        _.each(result.warnings, function(warning) {
                            var expected = t.typecheck[warning.line];
                            if (!expected) return;

                            expected = expected.split(",");
                            var code = expected.shift();

                            assert.equal(warning.code, code);

                            var i = 0;
                            warning.reason.replace(/'(.*?)'/g, function(a0, a1) {
                                assert.equal(expected[i], a1);
                                i++;
                            });

                            remaining[warning.line] = null;
                        });

                        _.each(remaining, function(value, key) {
                            if (value) {
                                assert(false, "Expected typechecker warning on line " + key);
                            }
                        });

                        return;   
                    }

                    if (!err && result.warnings && result.warnings.length) {
                        err = result.warnings[0];
                    }

                    if (err) {
                        if (!t.error || (err.name != t.error[0]) || (err.line != t.error[1])) {
                            if (!t.error) {
                                throw new Error("Unexpected error: " + err);
                            } else {
                                throw new Error("Expected: " +
                                    t.error[0] + " on line " + t.error[1] +
                                    ", actual: " +
                                    err.name + " on line " + err.line
                                );
                            }

                        } else {
                            return;
                        }

                    } else if (t.error && !err) {
                        assert(false, t.name + " compiled, but shouldn't have");
                    }

                    oj._reset();
                    var r = eval(result.code);
                    assert(r, "Test returned " + r);
                });
            });
        })
    });
});
