/*
    NSModel.js
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _             = require("lodash");
const NSError       = require("../Errors").NSError;
const Utils         = require("../Utils");
const NSClass       = require("./NSClass");
const NSGlobal      = require("./NSGlobal");
const NSProtocol    = require("./NSProtocol");
const NSMethod      = require("./NSMethod");
const NSConst       = require("./NSConst");
const NSEnum        = require("./NSEnum");
const NSType        = require("./NSType");
const NSSymbolTyper = require("./NSSymbolTyper")

const Log           = Utils.log;


class NSModel {


constructor()
{
    this._symbolTyper = new NSSymbolTyper(this);
    this._declarationMap = { };

    this.enums     = { };
    this.globals   = { };
    this.consts    = { };
    this.classes   = { };
    this.protocols = { };
    this.types     = { };

    // These are filled in at prepare() time
    this.numericMap  = { };
    this.booleanMap  = { };
    this.selectorMap = { };

    _.each([ "Array", "Boolean", "Number", "Object", "String", "Symbol" ], name => {
        this.types[name] = new NSType.makePrimitive(name);
        this._declarationMap[name] = true;
    });

    _.each([ "boolean", "BOOL" ], name => {
        this.types[name] = new NSType.makeAlias(name, "Boolean");
        this._declarationMap[name] = true;
    });

    _.each([ "number" ], name => {
        this.types[name] = new NSType.makeAlias(name, "Number");
        this._declarationMap[name] = true;
    });
}


loadState(state)
{
    function load(fromStateMap, toModelMap, cons) {
        _.each(fromStateMap, jsObject => {
            let nsObject = new cons();

            nsObject.loadState(jsObject);
            nsObject.local = false;

            toModelMap[nsObject.name] = nsObject;
        });
    };

    load( state.consts,     this.consts,     NSConst    );
    load( state.enums,      this.enums,      NSEnum     );
    load( state.globals,    this.globals,    NSGlobal   );
    load( state.classes,    this.classes,    NSClass    );
    load( state.protocols,  this.protocols,  NSProtocol );
    load( state.types,      this.types,      NSType     );

    _.extend(this.numericMap,      state.numericMap);
    _.extend(this.booleanMap,      state.booleanMap);
    _.extend(this.selectorMap,     state.selectorMap);
    _.extend(this._declarationMap, state.declarationMap);

    // NSSymbolTyper state is at same level for backwards compatibility
    this._symbolTyper.loadState(state);
}


saveState()
{
    function getState(objects) {
        return _.map(objects, o => o.saveState() );
    }

    let state = {
        consts:    getState( this.consts    ),
        enums:     getState( this.enums     ),
        globals:   getState( this.globals   ),
        classes:   getState( this.classes   ),
        protocols: getState( this.protocols ),
        types:     getState( this.types     ),

        declarationMap: this._declarationMap,

        numericMap:  this.numericMap,
        booleanMap:  this.booleanMap,
        selectorMap: this.selectorMap
    };

    // NSSymbolTyper state is at same level for backwards compatibility
    _.extend(state, this._symbolTyper.saveState());

    return state;
}


getSqueezeMap()
{
    let symbolTyper = this._symbolTyper;
    let result = { };

    if (symbolTyper) {
        _.extend(result, symbolTyper.getAllSymbolsMap());
    }

    return result;
}


saveBridged()
{
    let consts = _.compact(_.map(this.consts, nsConst => {
        if (nsConst.bridged) {
            return { name: nsConst.name, value: nsConst.value };
        } else {
            return null;
        }
    }));

    let enums  = _.compact(_.map(this.enums, nsEnum => {
        if (nsEnum.bridged) {
            return {
                name: nsEnum.anonymous ? null : nsEnum.name,
                unsigned: nsEnum.unsigned,
                values: _.clone(nsEnum.values)
            };

        } else {
            return null;
        }
    }));

    return { consts: consts, enums: enums };
}


prepare()
{
    let selectorMap = { };
    let booleanMap  = { };
    let numericMap  = { };

    _.each(this.classes, nsClass => {
        nsClass.prepared = false;
        nsClass.inherit(this);
    });

    // Check inheritance
    _.each(_.map(this.classes, cls => cls.name).sort(), name => {
        let currentClass = this.classes[name];
        let visited = [ ];

        while (currentClass) {
            let currentName = currentClass.name;

            if (visited.indexOf(currentName) >= 0) {
                throw Utils.makeError(NSError.CircularClassHierarchy, "Circular class hierarchy detected: " + JSON.stringify(visited));
            }

            visited.push(currentName);

            currentClass = currentClass.superclass;
        }
    });

    _.each(this.classes, cls => {
        cls.prepare(this);

        _.each(cls.getAllMethods(), method => {
            selectorMap[method.selectorName] = true;
        });
    });


    _.each(this.protocols, protocol => {
        _.each(protocol.getAllMethods(), method => {
            selectorMap[method.selectorName] = true;
        });
    });

    _.each(Utils.getBaseObjectSelectorNames(), selectorName => {
        selectorMap[selectorName] = true;
    });

    _.each(this.enums, nsEnum => {
        numericMap[nsEnum.name] = true;
    });

    _.each(this.types, type => {
        let currentType  = type;
        let currentName  = currentType.name;
        let originalName = currentName;
        let visitedNames = [ currentName ];

        while (currentType) {
            if (currentType.kind == NSType.KindAlias) {
                currentName = currentType.returnType;
                currentType = this.types[currentName];

                // Handle alias to enum
                if (!currentType && this.enums[currentName]) {
                    numericMap[originalName] = true;
                }

                if (visitedNames.indexOf(currentName) >= 0) {
                    Utils.throwError(NSError.CircularTypeHierarchy, "Circular @type hierarchy detected: \"" + visitedNames.join("\" -> \"") + "\"");
                }

                visitedNames.push(currentName);

            } else if (currentType.kind == NSType.KindPrimitive) {
                let name = currentType.name;

                if (name == "Boolean") {
                    booleanMap[originalName] = true; 
                } else if (name == "Number") {
                    numericMap[originalName] = true; 
                }

                currentType = null;

            } else {
                currentType = null;
            }
        }
    });

    this.numericMap  = numericMap;
    this.booleanMap  = booleanMap;
    this.selectorMap = selectorMap;
}


hasGlobalChanges(other)
{
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

    function buildEnumValueMap(model) {
        let result = { };

        _.each(model.enums, nsEnum => {
            _.extend(result, nsEnum.values);
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

    if (!_.isEqual(buildEnumValueMap(this), buildEnumValueMap(other))) {
        Log("hasGlobalChanges due to @enum");
        return true;
    }

    return false;
}


getChangedSelectorMap(other)
{
    let result = null;

    _.each(_.keys(this.selectorMap), selectorName => {
        if (!other.selectorMap[selectorName]) {
            if (!result) result = { };
            result[selectorName] = true;
        }
    });

    _.each(_.keys(other.selectorMap), selectorName => {
        if (!this.selectorMap[selectorName]) {
            if (!result) result = { };
            result[selectorName] = true;
        }
    });

    return result;
}


getAggregateClass()
{
    let result = new NSClass(null, null, null, null);

    function extractMethodsIntoMap(methods, map) {
        _.each(methods, function(m) {
            let selectorName = m.selectorName;
            let selectorType = m.selectorType;

            let types = _.clone(m.parameterTypes);
            types.unshift(m.returnType);

            let existing = map[selectorName];
            if (!existing) {
                map[selectorName] = types;
            } else {
                for (let i = 0, length = existing.length; i < length; i++) {
                    if (existing[i] != types[i]) {
                        existing[i] = "any";
                    }
                }
            }
        });
    }

    function addMethodsWithMap(map, selectorType) {
        _.each(map, function(value, key) {
            let returnType = value.shift();

            let variableNames = [ ];
            let index = 0;
            _.each(value, function(v) { variableNames.push("a" + index++);  });

            let m = new NSMethod(null, key, selectorType, returnType, value, variableNames);  
            result.addMethod(m);
        });
    }

    let instanceMap = { };
    let classMap    = { };

    _.each(this.classes, nsClass => {
        extractMethodsIntoMap(nsClass.getClassMethods(),    classMap);
        extractMethodsIntoMap(nsClass.getClassMethods(),    instanceMap);   // 'id' should also cover 'Class'
        extractMethodsIntoMap(nsClass.getInstanceMethods(), instanceMap);
    });

    addMethodsWithMap(classMap,    "+");
    addMethodsWithMap(instanceMap, "-");

    return result;
}


registerDeclaration(name, node)
{
    let existing = this._declarationMap[name];

    if (existing) {
        Utils.throwError(NSError.DuplicateDeclaration, `Duplicate declaration of "${name}"`, node)
    }

    this._declarationMap[name] = true;
}


addConst(nsConst)
{
    let name = nsConst.name;

    this.consts[name] = nsConst;
    this.registerDeclaration(name);
}


addEnum(nsEnum)
{
    let name = nsEnum.name;

    if (name) {
        if (this.enums[name]) {
            Utils.throwError(NSError.DuplicateEnum, `Duplicate declaration of enum "${name}"`);
        }

    } else {
        name = "N$_anonymousEnum" + _.size(this.enums);

        nsEnum.name = name;
        nsEnum.anonymous = true;
    }

    this.enums[name] = nsEnum;

    this.registerDeclaration(name);
}


addClass(nsClass)
{
    let name     = nsClass.name;
    let existing = this.classes[name];

    // We have an existing placeholder, copy over methods in case it's a category
    if (existing && existing.placeholder) {
        _.each(existing.getAllMethods(), m => nsClass.addMethod(m));
    }

    // Ensure we aren't overwriting a non-placeholder with a placeholder
    if (!existing || existing.placeholder) {
        this.classes[name] = nsClass;
    }

    // We have an existing non-placeholder and a new non-placeholder
    if (existing && !existing.placeholder && !nsClass.placeholder) {
        Utils.throwError(NSError.DuplicateClass, `Duplicate declaration of class "${name}"`);
    } 

    // Register a non-placeholder
    if (!nsClass.placeholder) {
        this.registerDeclaration(name);
    }
}


addProtocol(nsProtocol)
{
    let name = nsProtocol.name;

    if (this.protocols[name]) {
        Utils.throwError(NSError.DuplicateProtocol, `Duplicate declaration of protocol "${name}"`);
    }

    this.protocols[name] = nsProtocol;
}


addType(nsType)
{
    let name = nsType.name;

    if (this.types[name]) {
        Utils.throwError(NSError.DuplicateType, `Duplicate declaration of type "${name}"`);
    }

    this.types[name] = nsType;
    this.registerDeclaration(name);
}


addGlobal(nsGlobal)
{
    let name = nsGlobal.name;

    this.globals[name] = nsGlobal;
    this.registerDeclaration(name);
}


isNumericType(type)
{
    return !!this.numericMap[type];
}         


isBooleanType(type)
{
    return !!this.booleanMap[type];
}


getSymbolTyper()
{
    return this._symbolTyper;
}


}


module.exports = NSModel;
