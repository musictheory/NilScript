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
    [ "o", "output=FILE",               "output .js file"],
    [ "",  "input-state=FILE",          "input file for compiler state" ],
    [ "",  "output-state=FILE",         "output file for compiler state" ],
    [ "",  "output-symbols=FILE",       "output file for compiler symbols JSON" ],
    [ "",  "prepend=FILE+",             "prepend file to output (without compiling)"],
    [ "",  "append=FILE+",              "append file to output (without compiling)"],
    [ "",  "parser-source-type=TYPE",   "Passed to Esprima as sourceType.  'script' or 'module'"],
    [ "",  "source-map-file=FILE",      "output source map file" ],
    [ "",  "source-map-root=URL",       "URL to use for 'sourceRoot' in source map" ],    
    [ "s", "squeeze",                   "enable squeezer" ],
    [ "",  "squeeze-start-index",       "start index for squeezer" ],
    [ "",  "squeeze-end-index",         "end index for squeezer" ],

    [ "",  "output-language=LANG",      "output language" ],

    [ "",  "check-types",               "use type checker (experimental)" ],
    [ "",  "typescript-lib=GROUPS",     "type checker: specify built-in type declarations" ],
    [ "",  "def=FILE+",                 "type checker: specify additional definition file" ],
    [ "",  "no-implicit-any",           "type checker: disallow implicit any"              ],
    [ "",  "no-implicit-returns",       "type checker: warn about implicit returns"        ],
    [ "",  "no-unreachable-code",       "type checker: warn about unreachable code"        ],

    [ "",  "warn-global-no-type",       "warn about missing type annotations on @globals" ],
    [ "",  "warn-this-in-methods",      "warn about usage of 'this' in NilScript methods" ],
    [ "",  "warn-self-in-non-methods",  "warn about usage of 'self' in non-methods" ],

    [ "",  "warn-unknown-ivars",        "warn about unknown ivars"                 ],
    [ "",  "warn-unknown-selectors",    "warn about usage of unknown selectors"    ],
    [ "",  "warn-unknown-superclasses", "warn about usage of unknown superclasses" ],
    [ "",  "warn-unused-privates",      "warn about unused privates"               ],

    [ "",  "dev-dump-tmp",              "(for development)" ],
    [ "",  "dev-print-log",             "(for development)" ],

    [ "h", "help",                      "display this help" ],
    [ "v", "version",                   "show version"      ]
]);


opt.setHelp(
    "Usage: nsc [OPTIONS] INPUT_FILES\n" +
    "\n" +
    "[[OPTIONS]]\n" +
    "\n" +
    "Installation: npm install nilscript\n" +
    "Respository:  https://github.com/musictheory/NilScript"
);

opt.bindHelp();
opt.parseSystem();

let argv    = opt.parsedOption.argv;
let options = opt.parsedOption.options;


function printError(err)
{
    function toString(e) {
        let result  = "";

        let file   = e.file   || e.filename;
        let line   = e.line   || e.lineNumber;
        let column = e.column || e.columnNumber || e.col;
        let reason = e.reason || e.description;

        if (file)   result += file;
        if (line)   result += ":" + line;
        if (column) result += ":" + column;
        if (reason) result += " " + reason;

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
            console.error("nsc: error reading file: " + e);
            process.exit(1);
        }
    });
}


function readFileContents(files)
{
    if (!files) return null;

    let pairs = readFilePairs(files);

    if (!pairs || !pairs.length) {
        return null;
    }

    return _.map(pairs, function(pair) {
        return pair.contents;
    }).join("\n");
}

// Bail if no input files (specified after options)
if (!argv || argv.length == 0) {
    console.error("nsc: error: no input files");
    process.exit(1);
}


// Extract these options and delete
let inputStateFile    = options["input-state"];     delete(options["input-state"]);
let outputFile        = options["output"];          delete(options["output"]);
let outputStateFile   = options["output-state"];    delete(options["output-state"]);
let outputSymbolsFile = options["output-symbols"];  delete(options["output-symbols"]);

// Extract these options, don't delete (used by compiler)
let outputSourceMapFile = options["source-map-file"];

// Convert filenames in options to file contents
options["files"]   = readFilePairs(argv);
options["defs"]    = readFilePairs(options["defs"]);
options["prepend"] = readFileContents( options["prepend"] );
options["append"]  = readFileContents( options["append"]  );
options["state"]   = readFileContents( inputStateFile     );

if (outputStateFile) {
    options["include-state"] = true;
}

if (outputSourceMapFile) {
    options["include-map"] = true;
}

if (outputSymbolsFile) {
    options["include-symbols"] = true;
}


nilscript.compile(options).then(result => {
    printError(result.errors);
    printError(result.warnings);

    if (outputFile) {
        fs.writeFileSync(outputFile, result.code, "utf8")
    } else if (result.code) {
        process.stdout.write(result.code);
    }

    if (outputStateFile) {
        fs.writeFileSync(outputStateFile, JSON.stringify(result.state || { }, null, "    "), "utf8");
    }

    if (outputSourceMapFile) {
        console.log(result);
        fs.writeFileSync(outputSourceMapFile, result.map, "utf8");
    }

    if (outputSymbolsFile) {
        fs.writeFileSync(outputSymbolsFile, result.symbols, "utf8");
    }

    process.exit((result.errors?.length > 0) ? 1 : 0);
});

