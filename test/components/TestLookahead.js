
// Unlike Esprima, Acorn doesn't provide saveState/restoreState functionality.

import { Parser } from "../../src/Parser.js";

class TestLookaheadParser extends Parser
{

saveState()
{
    let state = super.saveState();

    state.__test_storage__ = { };
    Object.assign(state.__test_storage__, this);

    return state;
}

restoreState(state)
{
    let testStorageA = state.__test_storage__;
    delete(state.__test_storage__);

    super.restoreState(state);

    let testStorageB = { };
    Object.assign(testStorageB, this);

    let diffs = [ ];
    
    let keys = new Set([
        ...Object.keys(testStorageA),
        ...Object.keys(testStorageB)
    ]);

    for (let key of keys) {
        let valueA = testStorageA[key];
        let valueB = testStorageB[key];

        if (testStorageA[key] !== testStorageB[key]) {
            diffs.push(`'${key}' is different. '${valueA}' vs '${valueB}'`);
        }
    }

    if (diffs.length) {
        throw new Error(diffs.join("\n"));
    }
}

}


function test(s)
{

    console.log(TestLookaheadParser.parse(s, { ecmaVersion: 2022, locations: true }));
}

test("let x: Foo<Bar<A, B>>");

test("let x: (number) => string");
test("let x: (number)");
test("let x: (...foo) => void");

test(`let x: (
    number)`);




