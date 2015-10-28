/*
    ojc.js
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var Compiler = require("./compiler");


function compile(options, callback)
{
    try {
        var compiler = new Compiler(options);
        compiler.compile(callback);

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


module.exports = { compile: compile };

