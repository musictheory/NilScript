/*
    OJGlobal.js
    Model class for a global defined by @global
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJGlobal {


constructor(name, annotation)
{
    this.name = name;
    this.annotation = annotation || null;

    // Is this global in the current compilation unit?  *not archived*
    this.local = true;
}


loadState(state)
{
    this.name = state.name;
    this.annotation = state.annotation || null;
}


saveState()
{
    return {
        name: this.name,
        annotation: this.annotation
    }
}


}
