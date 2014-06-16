/*
    compiler.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var compiler = require("./compiler");


function ojc(options)
{
    return (new compiler.OJCompiler(options)).compile().finish();
}


module.exports = { ojc: ojc };

