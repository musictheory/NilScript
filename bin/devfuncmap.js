#!/usr/bin/env node 

/*
  (c) 2013-2023 musictheory.net, LLC
  MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _         from "lodash";
import getopt    from "node-getopt";
import fs        from "node:fs";
import util      from "node:util";
import nilscript from "../lib/api.js";


let opt = getopt.create([
    [ "h", "help",    "display this help" ],
    [ "v", "version", "show version"      ]
]);


opt.setHelp(
    "Usage: devfuncmap INPUT_FILE\n"
);

opt.bindHelp();
opt.parseSystem();

let argv    = opt.parsedOption.argv;
let options = opt.parsedOption.options;


function printError(err)
{
    function toString(e) {
        let result  = "";

        let file    = e.file   || e.filename;
        let line    = e.line   || e.lineNumber;
        let column  = e.column || e.columnNumber || e.col;
        let message = e.message || e.description;

        if (file)    result += file;
        if (line)    result += ":" + line;
        if (column)  result += ":" + column;
        if (message) result += " " + message;

        return result;
    }

    let strings;
    if (_.isArray(err)) {
        err = _.flatten(err);
        strings = _.map(err, function(e) { return toString(e) });
    } else {
        strings = [ toString(err) ];
    }

    console.error(_.uniq(strings).sort().join("\n"));        
}


function readFilePairs(files)
{
    if (!files) return [ ];

    files = _.isArray(files) ? files : [ files ];

    return _.map(files, file => {
        try {
            let contents = (fs.readFileSync(file).toString());
            return { path: file, contents: contents };
        } catch (e) {
            console.error("devfuncmap: error reading file: " + e);
            process.exit(1);
        }
    });
}


// Bail if no input files (specified after options)
if (!argv || argv.length == 0) {
    console.error("devfuncmap: error: no input files");
    process.exit(1);
}

// Convert filenames in options to file contents
options["files"] = readFilePairs(argv);
options["allow-private-options"] = true;
options["include-function-map"] = true;


nilscript.compile(options).then(result => {
    printError(result.errors);
    printError(result.warnings);

    for (let key of Object.keys(result.functionMap)) {
        console.log(key);
        for (let line of result.functionMap[key]) {
            console.log(`${line[0]}: ${line[1]}`);
        }
        console.log();
    }


//    console.log(JSON.stringify(result.functionMap, null, "    "));

    process.exit((result.errors?.length > 0) ? 1 : 0);
});

