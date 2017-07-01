/*
    OJModel.js
    (c) 2013-2017 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _             = require("lodash");
const OJError       = require("../errors").OJError;
const Utils         = require("../utils");
const OJClass       = require("./OJClass");
const OJGlobal      = require("./OJGlobal");
const OJProtocol    = require("./OJProtocol");
const OJMethod      = require("./OJMethod");
const OJConst       = require("./OJConst");
const OJEnum        = require("./OJEnum");
const OJType        = require("./OJType");
const OJSymbolTyper = require("./OJSymbolTyper")

const Log           = Utils.log;


class OJModel {


constructor()
{
    this._symbolTyper = new OJSymbolTyper(this);
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
        this.types[name] = new OJType.makePrimitive(name);
        this._declarationMap[name] = true;
    });

    _.each([ "boolean", "BOOL", "Bool", "bool" ], name => {
        this.types[name] = new OJType.makeAlias(name, "Boolean");
        this._declarationMap[name] = true;
    });

    _.each([ "number", "double", "float", "int", "char", "short", "long" ], name => {
        this.types[name] = new OJType.makeAlias(name, "Number");
        this._declarationMap[name] = true;
    });
}


loadState(state)
{
    function load(fromStateMap, toModelMap, cons) {
        _.each(fromStateMap, jsObject => {
            let ojObject = new cons();

            ojObject.loadState(jsObject);
            ojObject.local = false;

            toModelMap[ojObject.name] = ojObject;
        });
    };

    load( state.consts,     this.consts,     OJConst    );
    load( state.enums,      this.enums,      OJEnum     );
    load( state.globals,    this.globals,    OJGlobal   );
    load( state.classes,    this.classes,    OJClass    );
    load( state.protocols,  this.protocols,  OJProtocol );
    load( state.types,      this.types,      OJType     );

    _.extend(this.numericMap,      state.numericMap);
    _.extend(this.booleanMap,      state.booleanMap);
    _.extend(this.selectorMap,     state.selectorMap);
    _.extend(this._declarationMap, state.declarationMap);

    // OJSymbolTyper state is at same level for backwards compatibility
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

    // OJSymbolTyper state is at same level for backwards compatibility
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
    let consts = _.compact(_.map(this.consts, ojConst => {
        if (ojConst.bridged) {
            return { name: ojConst.name, value: ojConst.value };
        } else {
            return null;
        }
    }));

    let enums  = _.compact(_.map(this.enums, ojEnum => {
        if (ojEnum.bridged) {
            return {
                name: ojEnum.anonymous ? null : ojEnum.name,
                unsigned: ojEnum.unsigned,
                values: _.clone(ojEnum.values)
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

    _.each(this.classes, ojClass => {
        ojClass.prepared = false;
    });

    _.each(this.classes, (ojClass, name) => {
        ojClass.prepare(this);

        let methods = ojClass.getAllMethods();
        for (let i = 0, length = methods.length; i < length; i++) {
            selectorMap[methods[i].selectorName] = true;
        }
    });

    _.each(this.protocols, ojProtocol => {
        let methods = ojProtocol.getAllMethods();

        for (let i = 0, length = methods.length; i < length; i++) {
            selectorMap[methods[i].selectorName] = true;
        }
    });

    let baseObjectSelectors = Utils.getBaseObjectSelectorNames();
    for (let i = 0, length = baseObjectSelectors.length; i < length; i++) {
        selectorMap[baseObjectSelectors[i]] = true;
    }

    _.each(this.enums, ojEnum => {
        numericMap[ojEnum.name] = true;
    });

    _.each(this.types, ojType => {
        let currentType  = ojType;
        let currentName  = currentType.name;
        let originalName = currentName;
        let visitedNames = [ currentName ];

        while (currentType) {
            if (currentType.kind == OJType.KindAlias) {
                currentName = currentType.returnType;
                currentType = this.types[currentName];

                // Handle alias to enum
                if (!currentType && this.enums[currentName]) {
                    numericMap[originalName] = true;
                }

                if (visitedNames.indexOf(currentName) >= 0) {
                    Utils.throwError(OJError.CircularTypeHierarchy, "Circular @type hierarchy detected: '" + visitedNames.join("' -> '") + "'");
                }

                visitedNames.push(currentName);

            } else if (currentType.kind == OJType.KindPrimitive) {
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

        _.each(model.consts, ojConst => {
            result[ojConst.name] = ojConst.value;
        });

        return result;
    }

    function buildEnumValueMap(model) {
        let result = { };

        _.each(model.enums, ojEnum => {
            _.extend(result, ojEnum.values);
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
    let result = new OJClass(null, null, null, null);

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

            let m = new OJMethod(null, key, selectorType, returnType, value, variableNames);  
            result.addMethod(m);
        });
    }

    let instanceMap = { };
    let classMap    = { };

    _.each(this.classes, function(ojClass) {
        extractMethodsIntoMap(ojClass.getImplementedClassMethods(),    classMap);
        extractMethodsIntoMap(ojClass.getImplementedClassMethods(),    instanceMap);   // 'id' should also cover 'Class'
        extractMethodsIntoMap(ojClass.getImplementedInstanceMethods(), instanceMap);
    });

    addMethodsWithMap(classMap,    "+");
    addMethodsWithMap(instanceMap, "-");

    return result;
}


registerDeclaration(name, node)
{
    let existing = this._declarationMap[name];

    if (existing) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of '" + name + "'.", node)
    }

    this._declarationMap[name] = true;
}


addConst(ojConst)
{
    let name = ojConst.name;

    this.consts[name] = ojConst;
    this.registerDeclaration(name);
}


addEnum(ojEnum)
{
    let name = ojEnum.name;

    if (name) {
        if (this.enums[name]) {
            Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of enum '" + name + "'");
        }

    } else {
        name = "$OJAnonymousEnum" + _.size(this.enums);

        ojEnum.name = name;
        ojEnum.anonymous = true;
    }

    this.enums[name] = ojEnum;

    this.registerDeclaration(name);
}


addClass(ojClass)
{
    let name     = ojClass.name;
    let existing = this.classes[name];

    if (existing) {
        if (existing.forward && !ojClass.forward) {
            this.classes[name] = ojClass;

        } else if (existing.placeholder && !ojClass.forward) {
            this.classes[name] = ojClass;

            // This was a category placeholder and is being replaced by the real class, move over methods
            _.each(existing.getAllMethods(), function(m) {
                ojClass.addMethod(m);
            });

        } else if (!existing.forward && !ojClass.forward) {
            Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of class '" + name + "'");
        }

    } else {
        this.classes[name] = ojClass;
        this.registerDeclaration(name);
    }
}


addProtocol(ojProtocol)
{
    let name = ojProtocol.name;

    if (this.protocols[name]) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of protocol '" + name + "'");
    }

    this.protocols[name] = ojProtocol;
}


addType(ojType)
{
    let name = ojType.name;

    if (this.types[name]) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of type '" + name + "'");
    }

    this.types[name] = ojType;
    this.registerDeclaration(name);
}


addGlobal(ojGlobal)
{
    let name = ojGlobal.name;

    this.globals[name] = ojGlobal;
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


module.exports = OJModel;
