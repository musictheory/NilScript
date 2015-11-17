/*
    typechecker.js
    Generates TypeScript definition file and wraps TypeScript compiler 
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _  = require("lodash");
const ts = require("typescript");


const sBlacklistCodes  = [ 2417 ];

// See https://github.com/Microsoft/TypeScript/blob/master/src/compiler/diagnosticMessages.json
const sReasonTemplates = [
    // 2304: Cannot find name '{0}'.
    { code: 2304, type: "-", text: "Unknown method '{0}'"   },
    { code: 2304, type: "p", text: "Unknown protocol '{0}'" },
    { code: 2304, type: "c", text: "Unknown class '{0}'"    },
    { code: 2304,            text: "Unknown identifier '{0}'" },

    // 2339: Property '{0}' does not exist on type '{1}'.
    { code: 2339, type: "+", text: "No known class method: +[{1} {0}]"    },
    { code: 2339, type: "-", text: "No known instance method: -[{1} {0}]" },

    // 2415: Class '{0}' incorrectly extends base class '{1}'.
    // 2326: Types of property 'buildElements' are incompatible.
    { code: 2415, text: "'{2415:0}' and '{2415:1}' have incompatible method '{2326:0}'" },

    // 2420: Class '{0}' incorrectly implements interface '{1}'.
    // 2324: Property '{0}' is missing in type '{1}'.
    { code: 2420, next: 2324, text: "Method '{2324:0}' in protocol '{2420:1}' not implemented" },

    // 2420: Class '{0}' incorrectly implements interface '{1}'.
    // 2326: Types of property 'buildElements' are incompatible.
    { code: 2420, next: 2326, text: "'{2420:0}' and protocol '{2420:1}' have incompatible method '{2326:0}'" }
];


let sReasonTemplateMap = null;


function sGetReasonTemplate(code, nextCode, sawClass, sawProtocol, sawMethod, sawStatic) {
    var types = [ ];

    if (sawMethod)   types.push(sawStatic ? "+" : "-");
    if (sawClass)    types.push("c");
    if (sawProtocol) types.push("p");
    var type = sawMethod ? (sawStatic ? "+" : "-") : "";

    types.push(null);

    if (!sReasonTemplateMap) {
        sReasonTemplateMap = { };

        _.each(sReasonTemplates, function(t) {
            sReasonTemplateMap["" + t.code + "." + (t.next || 0) + (t.type || "")] = t;
        });
    }

    for (var i = 0, length = types.length; i < length; i++) {
        var reason = sReasonTemplateMap["" + code + "." + nextCode + (types[i] || "")];
        if (reason) return reason;
    }

    return null;
}


module.exports = class DiagnosticParser {


getWarnings(symbolTyper, diagnostics, fileCallback)
{
    let duplicateMap = { };

    function makeHintsWithDiagnostic(diagnostic) {
        var fileName = fileCallback(diagnostic.file.fileName);
        if (!fileName) return null;

        var lineColumn  = diagnostic.file ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : { line: 0, column: 0 };

        var code        = diagnostic.code;
        var next;
        var quotedMap   = { };
        var sawStatic   = false;
        var sawMethod   = false;
        var sawClass    = false;
        var sawProtocol = false;

        if (_.include(sBlacklistCodes, code)) {
            return null;
        }

        var reason = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        reason = reason.split("\n")[0];

        // messageText is a linked list of { messageText: , next: } objects
        // Traverse through it and set up quotedMap / saw*
        //
        (function() {
            function parseMessageText(object) {
                var code = object.code || code;
                var i    = 0;

                (object.messageText || object).replace(/'(.*?)'/g, function(a0, a1) {
                    if (a1.match(/^\$oj_C_/)) {
                        sawStatic = true;
                        sawClass = true;

                    } else if (a1.match(/\$oj_P_/)) {
                        sawStatic = true;
                        sawProtocol = true;

                    } else if (a1.match(/typeof \$oj_c_/)) {
                        sawClass = true;
                        sawStatic = true;

                    } else if (a1.match(/\$oj_c_/)) {
                        sawClass = true;

                    } else if (a1.match(/\$oj_p_/)) {
                        sawProtocol = true;

                    } else if (a1.match(/\$oj_f_/)) {
                        sawMethod = true;
                    }

                    a1 = symbolTyper.fromTypecheckerType(a1);

                    var key = "" + code + ":" + i;

                    if (!quotedMap[i])   quotedMap[i]   = a1;
                    if (!quotedMap[key]) quotedMap[key] = a1;

                    i++;

                    return a1;
                });
            }

            var messageText = diagnostic.messageText;
            while (messageText) {
                parseMessageText(messageText);
                messageText = messageText.next;
                if (!next) next = messageText ? messageText.code : 0;
            }
        }());

        // Now look up the friendlier reason string from the map
        //
        (function() {
            var template = sGetReasonTemplate(code, next, sawClass, sawProtocol, sawMethod, sawStatic);

            var valid  = true;
            var result = null;
            if (!result) result = sReasonTemplateMap["" + code];

            if (template) {
                result = template.text.replace(/\{(.*?)\}/g, function(a0, a1) {
                    var replacement = quotedMap[a1];
                    if (!replacement) valid = false;
                    return replacement;
                });
            }

            if (valid && result) {
                reason = result;
            }
        }());

        // Fixup reason string - convert TypeScript types to oj types and reformat
        //
        (function() {
            reason = reason.replace(/'(.*?)'/g, function(a0, a1) {
                return "'" + symbolTyper.fromTypecheckerType(a1) + "'";
            });

            reason = symbolTyper.getSymbolicatedString(reason);

            reason = reason.replace(/[\:\.]$/, "");
        }());



        var result = {
            code:   code,
            column: lineColumn.column,
            name:   "OJTypecheckerHint",
            file:   fileName,
            line:   lineColumn.line,
            reason: reason 
        };

        // Only return if this error message is unique (defs can spam duplicate messages)
        var key = result.file + ":" + result.line + ":" + result.reason;
        if (!duplicateMap[key]) {
            duplicateMap[key] = true;
            return result;
        }

        return null;
    }

    return _.compact(_.flatten(_.map(diagnostics, diagnostic => {
        return makeHintsWithDiagnostic(diagnostic);
    })));
}


}

