/*
    squeezer.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


var Squeezer = (function () {


function Squeezer(state, options)
{
    if (!state) state = { };

    this._toMap   = state["to"]      || { };
    this._fromMap = state["from"]    || { };
    this._id      = state["id"]      || 0;
    this._at      = state["at"]      || { };

    if (options.start && !this._id) {
        this._id = options.start;
    }

    this._maxId = options.max;
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


Squeezer.prototype.squeeze = function(oldName, isAtSqueeze)
{
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

        if (isAtSqueeze) {
            this._at[oldName] = newName;
        }
    }

    return newName;
}


Squeezer.prototype.lookup = function(oldName)
{
    var toMap = this._toMap;
    return toMap.hasOwnProperty(oldName) ? toMap[oldName] : undefined;
}


Squeezer.prototype.getState = function()
{
    return {
        "to":   this._toMap,
        "from": this._fromMap,
        "id":   this._id,
        "at":   this._at
    };
}


return Squeezer; })();

module.exports = { Squeezer: Squeezer };

