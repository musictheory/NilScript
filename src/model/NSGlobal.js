/*
    NSGlobal.js
    Model class for a global defined by @global
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


export class NSGlobal {


constructor(location, name, annotation)
{
    this.location = location;
    this.name = name;
    this.annotation = annotation || null;
    this.bridged = false;

    // Is this global in the current compilation unit?  *not archived*
    this.local = true;
}


loadState(state)
{
    this.location   =   state.location;
    this.name       =   state.name;
    this.annotation =   state.annotation || null;
    this.bridged    = !!state.bridged;
}


saveState()
{
    return {
        location: this.location,
        name: this.name,
        bridged: this.bridged,
        annotation: this.annotation
    }
}


}
