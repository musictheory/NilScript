//@opts = { "output-language": "none", "typescript-lib": "es2015", "check-types": true }

import { Parser } from "../../src/Parser.js";
import assert from "assert";

let types = [
    // Numeric literals
    //"-5", 
    "5", "3.14", "3e4",
    
    // String constants
    "'foo'", '"foo"',

    // Keyword/undefined
    "void", "null", "undefined",
    
    "this",
    "string", "number", "Foo", // 
    "string[]", "string[\n]",

    "(string)", "(\nnumber)",
    
    // Intersection / Union
    "Foo | null",
    "Foo | Bar", "Foo & Bar",
    "Foo\n| Bar", "Foo &\nBar",
    "|Foo&Foo",  "&Foo|Bar",

    "Foo<A>", "Foo<A, B>",
    "Foo<Bar<A>, B>",
    "Foo<Bar<Baz<A>,B>,C>",
    "Foo<Bar<A,B>>",
    "Foo<Bar<Baz<A,B,C>>>",
    
    "typeof Foo",
    "typeof\nFoo",
    "readonly number[]",
    "readonly\nnumber[]",
    
    "() => void",
    "(string) => number",
    "(string, string) => number",
    "(string, string) \n=> number",
    "(string, string) =>\n number"

];


for (let i = 0; i < types.length; i++) {
    for (let j = 0; j < types.length; j++) {
        for (let k = 0; k < types.length; k++) {
            let a = types[i];
            let b = types[j];
            let c = types[k];
            
            let input = `function x(a: ${a}, b: ${a}): ${b} { let x: ${c} = null, y; }`;

            try {
                let program = Parser.parse(input);
                
                let decl = program?.body?.[0];
                let body = decl?.body?.body;
                
                assert(decl);
                assert(body);
                assert(decl.params[0]?.annotation);
                assert(decl.params[1]?.annotation);
                assert(decl.annotation);
                assert(body);
                assert(body[0].declarations.length == 2);
                assert(body[0].declarations[0].init.raw == "null");

            } catch (e) {
                e.input = input;
                e.inputAt = input.slice(e.pos);
                throw e;
            }            
            
            break;
        }
    }
}

