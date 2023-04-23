/*
    Parser.js
    Wrapper around esprima to provide friendlier imports
    (c) 2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import esprima from "../ext/esprima.cjs";

export const Parser = {
    parse:  esprima.parse,
    Syntax: esprima.Syntax
};

export const Syntax = esprima.Syntax;
