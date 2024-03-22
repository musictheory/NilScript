/*
    Parser.js
    Wrapper around esprima to provide friendlier imports
    (c) 2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import esprima from "../ext/esprima.cjs";

import { Parser as MyParser } from "./Parser.js";
import fs from "node:fs";
import path from "node:path";

let sUseAcorn = true;

export const Parser = {
    parse: function(contents, file) {
        if (sUseAcorn) {
            return MyParser.parse(contents, { ecmaVersion: 2021, locations: true });
        } else {
            return esprima.parse(contents, { loc: true, sourceType: "module" });
        }
    },
    Syntax: esprima.Syntax
};

export const Syntax = esprima.Syntax;
