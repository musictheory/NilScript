//@opts = { }



import { Parser } from "./Parser.js";


for (let testCase of [
    "string",
    "string | number",
    "Foo & Bar | Baz",
    "Foo | Bar & Baz",
    "[ number, number, string? ]",
    "Foo?",
    "typeof Foo",
    "typeof Foo<A,B>",
    "Foo<A,B>",
    "readonly Foo",
    "Foo['bar']",
    "(string, number) => void",
    "6",
    "-5",
    "{ a: string, b?: number, c: string }"
]) {

    let ast = Parser.parse("let foo: " + testCase);
    
    let annotation = ast.body[0].declarations[0].id.annotation;
    
    console.log(testCase);
    // console.log(annotation);
    for (let i = 0; i < 1; i++) {
        // let t = new TypePrinter();
        // t._appendNode(annotation);
        // let x = t._c.join("");

        console.log(TypePrinter.print(annotation));
        // console.log(x);
        // let c = [ ];
        // N(c, annotation);
        // let x = c.join("");
//        TypePrinter.print2(annotation)
    }
    // console.log("----");

}

