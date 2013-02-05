//@opts = { }

var ojc = require("../src/compiler");
var fs  = require("fs");
var assert = require("assert");


var compile = function(inFile, options) {
    var inContent = "";

    inContent += fs.readFileSync(__dirname + "/../src/runtime.js");
    inContent += fs.readFileSync(inFile, "utf8");

    return ojc.compile(inContent, options);
}


function runTest(name)
{
    var src = compile(__dirname + "/inc/" + name + ".oj");

    test(name, function() {
        assert(eval(src), true);
    });
}


runTest("IvarAndProperties");
runTest("Inheritance");
runTest("Methods");
