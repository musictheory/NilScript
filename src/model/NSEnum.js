/*
    NSEnum.js
    Model class for an @enum declaration
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

export class NSEnum {


constructor(location, name, unsigned, bridged)
{
    this.location  =   location;
    this.name      =   name;
    this.unsigned  =   unsigned;
    this.anonymous =  !name;
    this.members   =   [ ];
    this.bridged   = !!bridged;
    this.local     =   true;
}


loadState(state)
{
    this.location  =   state.location;
    this.name      =   state.name;
    this.unsigned  = !!state.unsigned;
    this.anonymous = !!state.anonymous;
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
        unsigned:  this.unsigned,
        anonymous: this.anonymous,
        members:   this.members
    };
}


addMember(location, name, value)
{
    this.members.push({ location, name, value });
}


}
