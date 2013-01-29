/* Based on Modifier from harmonizr (http://github.com/jdiamond/harmonizr) */

var esprima = require("esprima");
var util = require("util");

var Modifier = (function () {
    function _clone(loc) {
        return {line: loc.line, column:loc.column};
    }

    function Modifier(src) {
        this.ast = esprima.parse(src, { loc: true });
        this.lines = src.split('\n');
        this.replacements = [ ];
    }
    Modifier.prototype.finish = function() {
        var replacement, from, line;

        this.replacements.sort(function(a, b) {
            if (a.lineIndex == b.lineIndex) {
                return b.toColumn - a.toColumn;
            } else {
                return b.lineIndex - a.lineIndex;
            }
        });

        for (var i = 0, length = this.replacements.length; i < length; i++) {
            replacement = this.replacements[i];
            line = this.lines[replacement.lineIndex];          
            this.lines[replacement.lineIndex] = line.substring(0, replacement.fromColumn) + (replacement.text || "") + line.substring(replacement.toColumn);
        }

        this.replacements = [ ];

        return this.lines.join('\n');
    };
    Modifier.prototype.refresh = function() {
        this.ast = parse(this.finish(), { loc: true });
    };
    /**
     * Removes all text between `from` and `to`.
     * Removal is *inclusive* which means the char pointed to by `to` is removed
     * as well. This makes it possible to remove a complete expression by
     * calling remove(expr.start, expr.end);
     * `to` may also be the number of characters to remove
     */
    Modifier.prototype._addReplacement = function(line, fromColumn, toColumn, text) {
        if (fromColumn === undefined) fromColumn = 0;
        if (toColumn   === undefined) toColumn = this.lines[line - 1].length;

        var existing = this.lines[line - 1].substring(fromColumn, toColumn);
        var replacement = {lineIndex: (line - 1), fromColumn: fromColumn, toColumn: toColumn};
        if (text) replacement.text = text;
        if (existing) replacement.existing = existing;
        this.replacements.push(replacement);
    }

    Modifier.prototype._replace = function(from, to, text) {
        // Make copy of from, as we may be passing in objects in the AST
        from = _clone(from);

        if (to === null || to === undefined) {
            to = {line: from.line, column: this.lines[from.line - 1].length }
        } else if (typeof to === 'number') {
            to = {line: from.line, column: from.column + to};
        } else {
            to = _clone(to);
        }

        if (from.line != to.line) {
            // Remove segment of first line
            this._addReplacement(from.line, from.column);

            // Remove intermediate lines completely
            for (var lineno = from.line + 1; lineno < to.line - 1; lineno++) {
                this._addReplacement(lineno, 0);
            }

            // Replace segment of last line with replacement text
            this._addReplacement(to.line, 0, to.column, text);
        } else {
            this._addReplacement(to.line, from.column, to.column, text);
        }
    };
    Modifier.prototype.remove = function(from, to, inclusive) {
        this._replace(from, to);
    };
    Modifier.prototype.insert = function(pos, text) {
        this._addReplacement(pos.line, pos.column, pos.column, text);
    };
    Modifier.prototype.replace = function(from, to, text, inclusive) {
        this._replace(from, to, text);
    }
; return Modifier;})();

var Modifier = Modifier;
/* vim: set sw=4 ts=4 et tw=80 : */


module.exports = {
    Modifier: Modifier
};