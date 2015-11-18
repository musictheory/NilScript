
"use strict";

let Compiler = require("../src/compiler");



module.exports = {
    Compiler: class {
        constructor() {
            this._impl = new Compiler();
        }

        parent(compiler) {
            this._impl.parent(compiler ? compiler._impl : null);
        }

        compile(options, callback) {
            this._impl.compile(options, callback);
        }
    },

    compile: function(options, callback) {
        try {
            if (options) {
                options["include-state"] = true;
            }

            let compiler = new Compiler();
            compiler.compile(options, callback);

        } catch (e) {
            if (e.name.indexOf("OJ") !== 0) {
                console.error("Internal oj error!")
                console.error("------------------------------------------------------------")
                console.error(e);
                console.error(e.stack);
                console.error("------------------------------------------------------------")
            }

            callback(e, null);
        }
    }
}
