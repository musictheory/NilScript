/*
    NSEnum.js
    Model class for an @enum declaration
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

export class NSEnum {


constructor(location, name, bridged)
{
    this.location  =   location;
    this.name      =   name;
    this.members   =   new Map();
    this.bridged   = !!bridged;
    this.local     =   true;
}


loadState(state)
{
    this.location  =   state.location;
    this.name      =   state.name;
    this.bridged   =   state.bridged;

    _.each(state.members, m => {
        this.addMember(m.location, m.name, m.value);
    });
}


saveState()
{
    return {
        location:  this.location,
        name:      this.name,
        bridged:   this.bridged,
        members:   Array.from(this.members.values())
    };
}


addMember(location, name, value)
{
    this.members.set(name, { location, name, value });
}


}
