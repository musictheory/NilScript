/*
    OJGlobal.js
    Model class for a global defined by @global
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

function OJGlobal(name, annotation)
{
    this.name = name;
    this.annotation = annotation || null;

    // Is this global in the current compilation unit?  *not archived*
    this.local = true;
}


OJGlobal.prototype.loadState = function(state)
{
    this.name = state.name;
    this.annotation = state.annotation || null;
}


OJGlobal.prototype.saveState = function()
{
    return {
        name: this.name,
        annotation: this.annotation
    }
}


module.exports = OJGlobal;
