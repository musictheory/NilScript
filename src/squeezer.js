/*
    compiler.js
    (c) 2013 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima   = require && require("esprima-oj");
var Traverser = require && require("./traverser").Traverser;
var Syntax    = esprima.Syntax;
var Modifier  = require && require("./modifier").Modifier;


var OJSqueezer = (function () {


function OJSqueezer(src, map)
{
    if (!map) map = { };

    this._toMap   = map["to"]   || { };
    this._fromMap = map["from"] || { };
    this._id      = map["id"]   || 0;

    this._modifier  = new Modifier(src, { });
    this._ast       = esprima.parse(src, { loc: true });
}

var sBase52Digits = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";

function sToBase52(index)
{
    var result = "";
    var base = 52;

    do {
        result += sBase52Digits.charAt(index % base);
        index = Math.floor(index / base);
        base = 62;
    } while (index > 0);

    return result;
}


OJSqueezer.prototype.shouldReplaceIdentifier = function(node)
{
    var name = node.name;

    return  name.indexOf("$oj_ivar_"  ) === 0 ||
            name.indexOf("$oj_method_") === 0 ||
            name.indexOf("$oj_class_" ) === 0;
}


OJSqueezer.prototype.replaceIdentifier = function(node)
{
    var oldName = node.name;
    var newName = this._toMap[oldName];

    if (!newName) {
        while (!newName) {
            var nameToTry = "$oj$" + sToBase52(this._id);
            if (!this._fromMap[nameToTry]) {
                newName = nameToTry;
            }

            this._id++;
        }

        this._toMap[oldName] = newName;
        this._fromMap[newName] = oldName;
    }

    this._modifier.select(node).replace(newName);
}


OJSqueezer.prototype.squeeze = function()
{
    var squeezer  = this;
    var traverser = new Traverser(this._ast);
    var modifier  = this._modifier;

    traverser.traverse(function() {
        var node = traverser.getNode();

        if (node.type === Syntax.Identifier) {
            if (squeezer.shouldReplaceIdentifier(node)) {
                squeezer.replaceIdentifier(node);
            }
        }
    });
}


OJSqueezer.prototype.getMap = function()
{
    return {
        "to":   this._toMap,
        "from": this._fromMap,
        "id":   this._id
    }
}


OJSqueezer.prototype.finish = function()
{
    return this._modifier.finish();
}


return OJSqueezer; })();


module.exports = {
    squeeze: function(src, opts) {
        var squeezer = new OJSqueezer(src, opts["map"]);
        squeezer.squeeze();

        opts["map"] = squeezer.getMap();

        return squeezer.finish();
    }
};
