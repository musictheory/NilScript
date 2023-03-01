
"use strict";

const _            = require("lodash");
const path         = require("path");

const CompilerImpl  = require("../src/Compiler");
const NSSymbolTyper = require("../src/model/NSSymbolTyper");


class Compiler {

constructor()
{
    this._impl = new CompilerImpl();
}


uses(compiler)
{
    this._impl.uses(compiler ? compiler._impl : null);
}


async compile(options)
{
    return this._impl.compile(options);
}


}


module.exports = {
    Compiler: Compiler,

    compile: async function(options) {
        return (new Compiler()).compile(options);
    },

    getRuntimePath: function() {
        return path.join(__dirname, "runtime.js");
    },

    symbolicate: function(symbol) {
        return NSSymbolTyper.symbolicate(symbol);
    }
};
