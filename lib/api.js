
import { Compiler as CompilerImpl } from "../src/Compiler.js";
import { tuneTypecheckerPerformance } from "../src/typechecker/Typechecker.js";
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


async collectTypecheckerWarnings()
{
    return this._impl.collectTypecheckerWarnings();
}


}


export default {
    Compiler,

    compile: async function(options) {
        return (new Compiler()).compile(options);
    },
    
    getRuntimePath: function() {
        return Utils.getProjectPath("lib/runtime.js");
    },

    tuneTypecheckerPerformance(includeInCompileResults, workerCount) {
        return tuneTypecheckerPerformance(includeInCompileResults, workerCount);
    },

    symbolicate: function(symbol) {
        return symbolicate(symbol);
    }
};
