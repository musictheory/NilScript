/*
    ojc.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var OJCompiler = require("./compiler").OJCompiler;


function ojc(options, callback)
{
    try {
        var compiler = new OJCompiler(options);
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


module.exports = { ojc: ojc };

