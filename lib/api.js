
import { Compiler as CompilerImpl } from "../src/Compiler.js";
import { tuneTypecheckerPerformance } from "../src/typechecker/Typechecker.js";
import { generateBuiltins } from "../src/typechecker/BuiltinGenerator.js"
import { Utils } from "../src/Utils.js";
import { SymbolUtils } from "../src/SymbolUtils.js"


export class Compiler {

    #impl;
    
    constructor()
    {
        this.#impl = new CompilerImpl();
    }


    uses(compiler)
    {
        this.#impl.uses(compiler ? compiler.#impl : null);
    }


    async compile(options)
    {
        return this.#impl.compile(options);
    }


    async collectTypecheckerWarnings()
    {
        return this.#impl.collectTypecheckerWarnings();
    }

}


export class File {

    #impl;

    constructor(impl) {
        this.#impl = impl;
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
    
    generateBuiltins(options) {
        return generateBuiltins(options);
    },

    symbolicate: function(symbol) {
        return SymbolUtils.symbolicate(symbol);
    }
};
