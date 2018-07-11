/*
    Modifier.js
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php

    Based on Modifier from harmonizr (http://github.com/jdiamond/harmonizr)
*/

"use strict";

const SourceMapGenerator = require && require("source-map").SourceMapGenerator;


let sTimestampCounter = 0;

function _colorString(string, from, to, color)
{
    let gray   = "\u001b[37m";
    let reset  = "\u001b[1;0m";

    let result = color + "\"" + string + "\"";

    if (from !== undefined && to !== undefined) {
        result += reset + " " + gray + "(" + from + "," + to + ")";
    }

    return result + reset;
}

function _red   (string, from, to) { return _colorString(string, from, to, "\u001b[1;31m"); }
function _green (string, from, to) { return _colorString(string, from, to, "\u001b[1;32m"); }
function _yellow(string, from, to) { return _colorString(string, from, to, "\u001b[1;33m");    }


function _isDescendantOf(a, b)
{
    while (a) {
        if (a === b) return true;
        a = a.oj_parent;
    }

    return false;
}


function Modifier(inLines, options)
{
    this._lines0 = inLines;

    this._current = { };
    this._replacements = [ ];
    this._debug = (options && options.debug);
    this._options = options || { };
}


Modifier.prototype._getLine = function(line1)
{
    return this._lines0[line1 - 1];
}


Modifier.prototype._setLine = function(line1, text)
{
    this._lines0[line1 - 1] = text;        
}


Modifier.prototype._addReplacement = function(line, fromColumn, toColumn, text)
{
    if ((fromColumn == toColumn) && !text) {
        return;
    }

    let replacement = { line: line, fromColumn: fromColumn, toColumn: toColumn, timestamp: sTimestampCounter++ };
    if (text) replacement.text = text;
    this._replacements.push(replacement);
}



Modifier.prototype._flush = function()
{
    let c = this._current;
    let text = c.text;
    let start, end, replaceAtStart;

    if (c.from && c.to) {
        if (_isDescendantOf(c.to, c.from)) {
            start = c.from.loc.start;
            end   = c.to.loc.start;
            replaceAtStart = true;

        } else if (_isDescendantOf(c.from, c.to)) {
            start = c.from.loc.end;
            end   = c.to.loc.end;

        } else {
            start = c.from.loc.end;
            end   = c.to.loc.start;
        }

    } else if (c.select) {
        start = c.select.loc.start;
        end   = c.select.loc.end;

    } else if (c.before) {
        start = end = c.before.loc.start;

    } else if (c.after) {
        start = end = c.after.loc.end;
    }

    if (start.line != end.line) {
        this._addReplacement(start.line, start.column, this._getLine(start.line).length, replaceAtStart ? text : "");

        // Remove intermediate lines completely
        for (let line = start.line + 1; line < end.line; line++) {
            this._addReplacement(line, 0, this._getLine(line).length, "");
        }

        this._addReplacement(end.line, 0, end.column, replaceAtStart ? "" : text);

    } else {
        this._addReplacement(start.line, start.column, end.column, text);
    }

    this._current = { };
}


Modifier.prototype.from   = function(node) { this._current.from   = node;  return this; }
Modifier.prototype.to     = function(node) { this._current.to     = node;  return this; }
Modifier.prototype.select = function(node) { this._current.select = node;  return this; }
Modifier.prototype.before = function(node) { this._current.before = node;  return this; }
Modifier.prototype.after  = function(node) { this._current.after  = node;  return this; }

Modifier.prototype.remove  = 
Modifier.prototype.insert  = 
Modifier.prototype.replace = function(text)
{
    this._current.text = text;
    this._flush();
}


Modifier.prototype.finish = function()
{
    this._replacements.sort(function(a, b) {
        if (a.line == b.line) {
            if (a.toColumn == b.toColumn) {
                if (a.text && b.text) {
                    // Both insertions, base on timestamp

                    if (a.text.length == b.text.length) {
                        return b.timestamp - a.timestamp; // same length = base on timestamp
                    } else {
                        return a.text.length - b.text.length; // else base on length
                    }

                } else if (!a.text && !b.text) {
                    // Is this right for both removals?
                    return b.timestamp - a.timestamp;

                } else if (!a.text && b.text) {
                    return 1;

                } else {
                    return -1;
                }

            } else {
                return b.toColumn - a.toColumn;
            }
        } else {
            return b.line - a.line;
        }
    });



    for (let i = 0, length = this._replacements.length; i < length; i++) {
        let r      = this._replacements[i];
        let line1  = r.line;
        let line   = this._getLine(line1);

        let before = line.substring(0, r.fromColumn);
        let after  = line.substring(r.toColumn);

        if (this._debug) {
            let toRemove = line.substring(r.fromColumn, r.toColumn);

            if (r.text && toRemove) {
                console.log("" + r.line + ": replacing " + _red(toRemove, r.fromColumn, r.toColumn) + " with " + _green(r.text));
            } else if (toRemove) {
                console.log("" + r.line + ": deleting " + _red(toRemove, r.fromColumn, r.toColumn));
            } else if (r.text) {
                console.log("" + r.line + ": inserting " + _green(r.text, r.fromColumn, r.toColumn) + " between " + _yellow(before) + " and " + _yellow(after));
            }
        }
        this._setLine(r.line, before + (r.text || "") + after);
        if (this._debug) {
            console.log("Line " + r.line + " is now " + this._getLine(r.line));
            console.log();
        }
    }

    return this._lines0;
}


module.exports = Modifier;
