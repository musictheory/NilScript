/*
    OJObserver.js
    Simple model class for property observers (@observe)
    (c) 2016-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";


module.exports = class OJObserver {


constructor(location, name, change, before, after)
{
    this.location = location;
    this.name     = name;
    this.change   = change;
    this.before   = before;
    this.after    = after;
}


}
