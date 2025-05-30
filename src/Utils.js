/*
    Utils.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _    from "lodash";
import path from "node:path";
import fs   from "node:fs";
import { fileURLToPath } from "node:url";


let sShouldLog = false;

function enableLog()
{
    sShouldLog = true;
}


function log()
{
    if (!sShouldLog) return;
    console.log.apply(this, _.toArray(arguments));
}


function mkdirAndWriteFile(file, contents)
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}


function getProjectPath(file)
{
    let base = fileURLToPath(new URL("..", import.meta.url));
    return path.resolve(base, file);
}


function getRuntimePath()
{
    return getProjectPath("lib/runtime.js");
}


export const Utils = {
    getProjectPath,
    getRuntimePath,

    enableLog,
    log,

    mkdirAndWriteFile
};
