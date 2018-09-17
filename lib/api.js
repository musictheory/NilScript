
"use strict";

const _            = require("lodash");
const path         = require("path");

const CompilerImpl  = require("../src/Compiler");
const NSSymbolTyper = require("../src/model/NSSymbolTyper");


function _logInternalErrors(errors)
{
    _.each(errors, error => {
        if (error.name.indexOf("NilScript") !== 0) {
            console.error("Internal NilScript error!")
            console.error("------------------------------------------------------------");
            console.error(error);
            console.error(error.stack);
            console.error("------------------------------------------------------------");
        }
    });
}


class Compiler {

constructor()
{
    this._impl = new CompilerImpl();
}


uses(compiler)
{
    this._impl.uses(compiler ? compiler._impl : null);
}


compile(options, callback)
{
    try {
        this._impl.compile(options, (err, results) => {
            if (err) {
                if (!results) results = { errors: [ err ] };
                if (!results.errors) results.errors = [ err ];
                if (!results.errors.length) results.errors = [ err ];

            } else if (!err && results.errors && results.errors.length) {
                err = results.errors[0];
            }

            _logInternalErrors(results.errors);

            callback(err, results);
        });

    } catch (err) {
        _logInternalErrors([ err ]);
        callback(err, { errors: [ err ] });
    }
}


}


module.exports = {
    Compiler: Compiler,

    compile: function(options, callback) {
        (new Compiler()).compile(options, callback);
    },

    getRuntimePath: function() {
        return path.join(__dirname, "runtime.js");
    },

    symbolicate: function(symbol) {
        return NSSymbolTyper.symbolicate(symbol);
    }
};
