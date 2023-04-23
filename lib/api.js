
import { Compiler as CompilerImpl } from "../src/Compiler.js";
import { symbolicate } from "../src/model/NSSymbolTyper.js";
import { Utils } from "../src/Utils.js";

export class Compiler {

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


export default {
    Compiler: Compiler,

    compile: async function(options) {
        return (new Compiler()).compile(options);
    },

    getRuntimePath: function() {
        return Utils.getProjectPath("lib/runtime.js");
    },

    symbolicate: function(symbol) {
        return symbolicate(symbol);
    }
};
