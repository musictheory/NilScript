/*
    Model.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/


import _ from "lodash";

import { CompilerIssue } from "./CompilerIssue.js";


class Class {

    constructor(location, name, superClassName)
    {
        this.location       = location;
        this.name           = name;
        this.superClassName = superClassName;
        
        this.hasConstructor = false;
        this.hasFuncOrProp  = false;
        
        this._getters = new Set();
        this._setters = new Set();
        this._fields  = new Set();
        this._props   = new Set();
        this._ivars   = new Set();
    }

    _key(name, isStatic) { return isStatic ? `static ${name}` : name; }

    addProp(name) { this._props.add(name); this._ivars.add(`_${name}`); }
    hasProp(name) { return this._props.has(name); }
    hasIvar(name) { return this._ivars.has(name); }

    addGetter(name, isStatic) { this._getters.add(this._key(name, isStatic)); }
    addSetter(name, isStatic) { this._setters.add(this._key(name, isStatic)); }
    addField( name, isStatic) { this._fields.add( this._key(name, isStatic)); }

    hasGetter(name, isStatic) { return this._getters.has(this._key(name, isStatic)); }
    hasSetter(name, isStatic) { return this._setters.has(this._key(name, isStatic)); }
    hasField( name, isStatic) { return this._fields.has( this._key(name, isStatic)); }

}


class Enum {

    constructor(location, name, bridged)
    {
        this.location = location;
        this.name     = name;
        this.members  = new Map();
        this.bridged  = !!bridged;
    }


    addMember(location, name, value)
    {
        this.members.set(name, { location, name, value });
    }

}

class GlobalConst {

    constructor(location, name, value, raw)
    {
        this.location = location;
        this.name     = name;
        this.value    = value;
        this.raw      = raw;
    }
}


class GlobalFunction {

    constructor(location, name, annotation)
    {
        this.location = location;
        this.name = name;
        this.params = [ ];
        this.annotation = annotation ?? null;
    }
    
    addParameter(name, optional, annotation)
    {
        this.params.push({ name, optional, annotation });    
    }

}


class Global {

    constructor(location, type, name, annotation)
    {
        this.location = location;
        this.type = type;
        this.name = name;
        this.params = [ ];
        this.annotation = annotation ?? null;
        this.bridged = false;
    }
    
    addParameter(name, optional, annotation)
    {
        this.params.push({ name, optional, annotation });    
    }
}

class Runtime {
    name = "Nyx";
}

class Type {

    constructor(location, name, reference)
    {
        this.location  = location;
        this.name      = name;
        this.reference = reference;
    }

}


class Value {

    constructor(location, name)
    {
        this.location  = location;
        this.name      = name;
    }
}


export class Model {

static Class = Class;
static Enum  = Enum;
static GlobalConst = GlobalConst;
static GlobalFunction = GlobalFunction;
static Runtime = Runtime;
static Type    = Type;
static Value   = Value;

#objects = new Map();
globalConsts  = new Map();
globalFunctions = new Map();


constructor(parents)
{
    this.add(new Runtime());

    if (parents) {
        parents.forEach(parent => this._inherit(parent));
    }
}


_inherit(parent)
{
    function extend(myMap, parentMap) {
        for (let [ key, value ] of parentMap) {
            myMap.set(key, value);
        }
    }
    
    extend( this.globalConsts,    parent.globalConsts );
    extend( this.globalFunctions, parent.globalFunctions);
    extend( this.#objects,        parent.#objects);
}


saveBridged()
{
    let consts = [ ], enums = [ ];

    for (let { name, value } of this.globalConsts.values()) {
        consts.push({ name, value });
    }

    for (let modelObject of this.#objects.values()) {
        if (modelObject instanceof Enum) {
            let members = Array.from(modelObject.members.values());
            
            enums.push({
                name: modelObject.name,
                members: members.map(({ name, value }) => {
                    return { name, value };
                })
            });
        }
    }

    return { consts: consts, enums: enums };
}


hasGlobalChanges(other)
{
    return true;
/*
    function existanceChanged(a, b) {
        let keysA = _.keys(a).sort();
        let keysB = _.keys(b).sort();

        return !_.isEqual(keysA, keysB);
    }

    function buildConstValueMap(model) {
        let result = { };

        _.each(model.consts, nsConst => {
            result[nsConst.name] = nsConst.value;
        });

        return result;
    }

    if (existanceChanged(this.classes,   other.classes   ) ||
        existanceChanged(this.protocols, other.protocols ) ||
        existanceChanged(this.types,     other.types     ) ||
        existanceChanged(this.globals,   other.globals   ) ||
        existanceChanged(this.enums,     other.enums     ) ||
        existanceChanged(this.consts,    other.consts    ))
    {
        Log("hasGlobalChanges due to existance change");
        return true;
    }


    // Inlined @const and inlined @enum values also count as a global change
    //
    if (!_.isEqual(buildConstValueMap(this), buildConstValueMap(other))) {
        Log("hasGlobalChanges due to @const");
        return true;
    }

    return false;
*/
}


add(object)
{
    let name = object.name;
    let existing = this.#objects.get(name);

    if (existing) {
        throw new CompilerIssue(`Duplicate declaration of "${name}"`, object.location);
    }

    this.#objects.set(name, object);
    
    if (object instanceof GlobalFunction) {
        this.globalFunctions.set(name, object);
    } else if (object instanceof GlobalConst) {
        this.globalConsts.set(name, object);
    }
}


get(name)
{
    return this.#objects.get(name);
}



}