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
        compiler.compile();
        compiler.finish(callback);

    } catch (e) {
        callback(e, null);
    }
}


module.exports = { ojc: ojc };

