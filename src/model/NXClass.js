/*
    NSClass.js
    Model class for an NilScript class implementation
    (c) 2013-2023d musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";

import { NSError    } from "../Errors.js";
import { NSWarning  } from "../Errors.js";
import { Utils      } from "../Utils.js";

import { Syntax } from "../LegacyParser.js";


function _makeKey(key, isStatic)
{
    return (isStatic ? "static " : "") + key;
}


export class NXClass {

#elements = [ ];
#getters = { };
#setters = { };
#fields  = { };

constructor(location, name, superclass)
{
    this.location = location;
    this.name     = name;
    this.superclass = superclass;
}


loadState(state)
{

}


saveState()
{
    return {
        // location:        this.location,
        // name:            this.name,
        // inheritedNames:  this.inheritedNames,
        // didSynthesis:  !!this.didSynthesis,

        // properties: _.values(this._propertyMap),

        // methods: _.flatten([
        //     _.values(this._classMethodMap),
        //     _.values(this._instanceMethodMap)
        // ])
    }
}


prepare(model)
{

}


addElement(node)
{
    this.#elements.push(node);

    let key = _makeKey(node.key.name, node.static);
    
    if (node.type == Syntax.MethodDefinition) {
        if (node.kind == "get") {
            this.#getters[key] = true;
        } else if (node.kind == "set") {
            this.#setters[key] = true;
        }

    } else if (node.type == Syntax.PropertyDefinition) {
        this.#fields[key] = true;
    }
}

hasGetter(key, isStatic)
{
    key = _makeKey(key, isStatic);
    return !!this.#getters[key];
}

hasSetter(key, isStatic)
{
    console.log(this.#setters);
    
    key = _makeKey(key, isStatic);
    return !!this.#setters[key];
}

hasField(key, isStatic)
{
    key = _makeKey(key, isStatic);
    return !!this.#fields[key];
}

}