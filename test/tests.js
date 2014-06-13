//@opts = { }

var ojc = require("../src/compiler");
var fs  = require("fs");
var assert = require("assert");
var OJError = require("../src/errors.js").OJError;
var oj = require("../src/runtime.js");

var compile = function(inFile, options) {
    var inContent = "";
    inContent += fs.readFileSync(inFile, "utf8");
    return ojc.compile(inContent, options);
}


function runTest(name, options)
{
    var src = compile(__dirname + "/" + name + ".oj", options);

    test(name, function() {
        assert(eval(src.content), true);
    });

    options = options || { };
    options.squeeze = true;

    var src2 = compile(__dirname + "/" + name + ".oj", options);

    test(name, function() {
        assert(eval(src2.content), true);
    });
}


function shouldFailToCompile(name, errorType, options) {
    var didFailWithCorrectType = false;

    try {
        var src = compile(__dirname + "/should_fail/" + name + ".oj", options);

    } catch (e) {
        didFailWithCorrectType = (e.errorType == errorType);
    }

    test(name, function() {
        assert(didFailWithCorrectType, name + " compiled, but shouldn't have");
    });
}


runTest("inc/IvarAndProperties");
runTest("inc/Inheritance");
runTest("inc/Methods");
runTest("inc/EnumAndConst");
runTest("inc/LoadAndInitialize");

runTest("issues/issue1");
runTest("issues/issue2");
runTest("issues/issue10");

shouldFailToCompile("CheckIvar",                       OJError.UndeclaredInstanceVariable, { "check-ivars": true });
shouldFailToCompile("UseOfThisInMethod",               OJError.UseOfThisInMethod,          { "check-this": true  });
shouldFailToCompile("DuplicateProperty",               OJError.DuplicatePropertyDefinition);
shouldFailToCompile("DuplicateMethod",                 OJError.DuplicateMethodDefinition);
shouldFailToCompile("DuplicateJavascriptFunction",     OJError.DuplicateJavascriptFunction);
shouldFailToCompile("PropertyAlreadyDynamic",          OJError.PropertyAlreadyDynamic);
shouldFailToCompile("PropertyAlreadyDynamic2",         OJError.PropertyAlreadyDynamic);
shouldFailToCompile("PropertyAlreadySynthesized",      OJError.PropertyAlreadySynthesized);
shouldFailToCompile("InstanceVariableAlreadyClaimed",  OJError.InstanceVariableAlreadyClaimed);
shouldFailToCompile("InstanceVariableAlreadyClaimed2", OJError.InstanceVariableAlreadyClaimed);
shouldFailToCompile("NonLiteralConst1",                OJError.NonLiteralConst);
shouldFailToCompile("NonLiteralConst2",                OJError.NonLiteralConst);
shouldFailToCompile("NonLiteralEnum1",                 OJError.NonLiteralEnum);
shouldFailToCompile("NonLiteralEnum2",                 OJError.NonLiteralEnum);
shouldFailToCompile("NonIntegerEnum1",                 OJError.NonIntegerEnum);
shouldFailToCompile("NonIntegerEnum2",                 OJError.NonIntegerEnum);

//Needs compiler changes to work
//shouldFailToCompile("TestReservedWord1",               OJError.SelfIsReserved);
shouldFailToCompile("TestReservedWord2",               OJError.DollarOJIsReserved);
shouldFailToCompile("TestReservedWord3",               OJError.DollarOJIsReserved);

