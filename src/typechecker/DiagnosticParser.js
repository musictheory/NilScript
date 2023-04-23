/*
    DiagnosticParser.js
    Translates TypeScript compiler warnings/errors into oj-like ones
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _  from "lodash";
import ts from "typescript";
import { NSWarning } from "../Errors.js";

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
    { code: 2415, next: 2326, text: "'{2415:0}' and '{2415:1}' have incompatible method '{2326:0}'", retarget: [ "class" , "2415:0" ] },

    // 2420: Class '{0}' incorrectly implements interface '{1}'.
    // 2324: Property '{0}' is missing in type '{1}'.
    { code: 2420, next: 2324, text: "Method '{2324:0}' in protocol '{2420:1}' not implemented", retarget: [ "class", "2420:0" ] },

    // 2420: Class '{0}' incorrectly implements interface '{1}'.
    // 2326: Types of property 'buildElements' are incompatible.
    { code: 2420, next: 2326, text: "'{2420:0}' and protocol '{2420:1}' have incompatible method '{2326:0}'", retarget: [ "class", "2420:0" ] }
];


let sReasonTemplateMap = null;


function sGetReasonTemplate(code, nextCode, sawClass, sawProtocol, sawMethod, sawStatic) {
    let types = [ ];

    if (sawMethod)   types.push(sawStatic ? "+" : "-");
    if (sawClass)    types.push("c");
    if (sawProtocol) types.push("p");
    let type = sawMethod ? (sawStatic ? "+" : "-") : "";

    types.push(null);

    if (!sReasonTemplateMap) {
        sReasonTemplateMap = { };

        _.each(sReasonTemplates, function(t) {
            sReasonTemplateMap["" + t.code + "." + (t.next || 0) + (t.type || "")] = t;
        });
    }

    for (let i = 0, length = types.length; i < length; i++) {
        let reason = sReasonTemplateMap["" + code + "." + nextCode + (types[i] || "")];
        if (reason) return reason;
    }

    return null;
}


export class DiagnosticParser {


constructor(model)
{
    this._model = model;
}


getWarnings(diagnostics, fileCallback)
{
    let model        = this._model;
    let symbolTyper  = model.getSymbolTyper();
    let duplicateMap = { };

    function makeHintsWithDiagnostic(diagnostic) {
        let fileName = diagnostic && diagnostic.file && diagnostic.file.fileName;
        if (!fileName) return null;

        let lineColumn  = diagnostic.file ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : { line: 0, column: 0 };
        let lineNumber  = lineColumn.line + 1;

        let code        = diagnostic.code;
        let next;
        let quotedMap   = { };
        let sawStatic   = false;
        let sawMethod   = false;
        let sawClass    = false;
        let sawProtocol = false;

        if (_.includes(sBlacklistCodes, code)) {
            return null;
        }

        let reason = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        reason = reason.split("\n")[0];

        // messageText is a linked list of { messageText: , next: } objects
        // Traverse through it and set up quotedMap / saw*
        //
        {
            function parseMessageText(object) {
                let i = 0;

                (object.messageText || object).replace(/'(.*?)'/g, function(a0, a1) {
                    if (a1.match(/^N\$_C_/)) {
                        sawStatic = true;
                        sawClass = true;

                    } else if (a1.match(/N\$_P_/)) {
                        sawStatic = true;
                        sawProtocol = true;

                    } else if (a1.match(/typeof N\$_c_/)) {
                        sawClass = true;
                        sawStatic = true;

                    } else if (a1.match(/N\$_c_/)) {
                        sawClass = true;

                    } else if (a1.match(/N\$_p_/)) {
                        sawProtocol = true;

                    } else if (a1.match(/N\$_f_/)) {
                        sawMethod = true;
                    }

                    a1 = symbolTyper.fromTypecheckerType(a1);

                    let key = "" + (object.code || code) + ":" + i;

                    if (!quotedMap[i])   quotedMap[i]   = a1;
                    if (!quotedMap[key]) quotedMap[key] = a1;

                    i++;

                    return a1;
                });
            }

            let arr = [ diagnostic.messageText ];
            if (diagnostic.messageText.next) {
                arr.push(...diagnostic.messageText.next);
            }

            _.each(arr, messageText => {
                parseMessageText(messageText);
                if (!next) next = messageText ? messageText.code : 0;
            });
        }

        // Now look up the friendlier reason string from the map
        //
        {
            let template = sGetReasonTemplate(code, next, sawClass, sawProtocol, sawMethod, sawStatic);

            let valid  = true;
            let result = null;
            if (!result) result = sReasonTemplateMap["" + code];

            if (template) {
                if (template.retarget) {
                    let retargetType = template.retarget[0];
                    let retargetArg  = template.retarget[1];

                    let resolvedArg = quotedMap[retargetArg];
                    if (resolvedArg) resolvedArg = symbolTyper.fromTypecheckerType(resolvedArg);

                    console.log(retargetType, retargetArg, resolvedArg);

                    if (resolvedArg) {
                        if (retargetType == "class") {
                            let nsClass = model.classes[resolvedArg];

                            fileName   = nsClass && nsClass.location ? nsClass.location.path : fileName;
                            lineNumber = nsClass && nsClass.location ? nsClass.location.line : lineNumber;

                        } else if (retargetType == "protocol") {
                            let nsProtocol = model.protocols[resolvedArg];

                            fileName   = nsProtocol && nsProtocol.location ? nsProtocol.location.path : fileName;
                            lineNumber = nsProtocol && nsProtocol.location ? nsProtocol.location.line : lineNumber;
                        }
                    }
                }

                result = template.text.replace(/\{(.*?)\}/g, function(a0, a1) {
                    let replacement = quotedMap[a1];
                    if (!replacement) valid = false;
                    return replacement;
                });
            }

            if (valid && result) {
                reason = result;
            }
        }

        // Fixup reason string - convert TypeScript types to oj types and reformat
        //
        {
            reason = reason.replace(/'(.*?)'/g, function(a0, a1) {
                return "'" + symbolTyper.fromTypecheckerType(a1) + "'";
            });

            reason = symbolTyper.getSymbolicatedString(reason);

            reason = reason.replace(/[\:\.]$/, "");
        }

        fileName = fileCallback(fileName);
        if (!fileName) return null;

        // Only return if this error message is unique (defs can spam duplicate messages)
        let key = fileName + ":" + lineNumber + ":" + reason;

        if (!duplicateMap[key]) {
            duplicateMap[key] = true;

            let error = new Error(reason);

            error.name   = NSWarning.Typechecker;
            error.file   = fileName;
            error.line   = lineNumber;
            error.column = lineColumn.column;
            error.reason = reason;
            error.code   = code;

            return error;
        }

        return null;
    }

    return _.compact(_.flatten(_.map(diagnostics, diagnostic => {
        return makeHintsWithDiagnostic(diagnostic);
    })));
}


}

