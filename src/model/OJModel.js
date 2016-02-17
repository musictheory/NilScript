/*
    OJModel.js
    (c) 2013-2015 musictheory.net, LLC
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
const OJStruct      = require("./OJStruct");
const OJSymbolTyper = require("./OJSymbolTyper")


class OJModel {


constructor()
{
    this.enums     = { };
    this.globals   = { };
    this.consts    = { };
    this.classes   = { };
    this.structs   = { };
    this.protocols = { };
    this.selectors = { };

    this._symbolTyper = new OJSymbolTyper(this);

    this.types = { };
    this.registerType( [
        "Array",
        "Boolean",
        "Number",
        "Object",
        "String",
        "Symbol"
    ]);

    this.aliasType( "Boolean", [ "boolean", "BOOL", "Bool", "bool" ] );
    this.aliasType( "Number",  [ "number", "double", "float", "int", "char", "short", "long" ] );
}


loadState(state)
{
    function load(fromStateMap, toModelMap, cons) {
        _.each(fromStateMap, jsObject => {
            var ojObject = new cons();

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
    load( state.structs,    this.structs,    OJStruct   );

    _.extend(this.types,     state.types);
    _.extend(this.selectors, state.selectors);

    // OJSymbolTyper state is at same level for backwards compatibility
    this._symbolTyper.loadState(state);
}


saveState()
{
    function getState(objects) {
        return _.map(objects, o => o.saveState() );
    }

    var state = {
        consts:    getState( this.consts    ),
        enums:     getState( this.enums     ),
        globals:   getState( this.globals   ),
        classes:   getState( this.classes   ),
        protocols: getState( this.protocols ),
        structs:   getState( this.structs   ),

        types:     this.types,
        selectors: this.selectors
    };

    // OJSymbolTyper state is at same level for backwards compatibility
    _.extend(state, this._symbolTyper.saveState());

    return state;
}


saveSymbols()
{
    let symbolTyper = this._symbolTyper;
    let result = { };

    _.each(this.classes, ojClass => {
        result[ symbolTyper.getSymbolForClassName(ojClass.name) ] = ojClass.name;

        _.each(ojClass.getAllIvars(), function(ojIvar) {
            result[ symbolTyper.getSymbolForIvar(ojIvar) ] = ojIvar.name;
        });
    });

    _.each(_.keys(this.selectors), name => {
        result[ symbolTyper.getSymbolForSelectorName(name) ] = name;
    });

    return result;
}


saveBridged()
{
    var consts = _.compact(_.map(this.consts, ojConst => {
        if (ojConst.bridged) {
            return { name: ojConst.name, value: ojConst.value };
        } else {
            return null;
        }
    }));

    var enums  = _.compact(_.map(this.enums, ojEnum => {
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
    var selectors = { };

    var classes = this.classes;
    _.each(classes, function(ojClass, name) {
        // Check for circular hierarchy
        var visited = [ name ];
        var superclass = ojClass.superclassName ? classes[ojClass.superclassName] : null;

        while (superclass) {
            if (visited.indexOf(superclass.name) >= 0) {
                Utils.throwError(OJError.CircularClassHierarchy, "Circular class hierarchy detected: '" + visited.join(",") + "'");
            }

            visited.push(superclass.name);

            superclass = classes[superclass.superclassName];
        }

        ojClass.doAutomaticSynthesis();

        var methods = ojClass.getAllMethods();
        for (var i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }
    });

    _.each(this.protocols, function(ojProtocol, name) {
        var methods = ojProtocol.getAllMethods();

        for (var i = 0, length = methods.length; i < length; i++) {
            selectors[methods[i].selectorName] = true;
        }
    });

    var baseObjectSelectors = Utils.getBaseObjectSelectorNames();
    for (var i = 0, length = baseObjectSelectors.length; i < length; i++) {
        selectors[baseObjectSelectors[i]] = true;
    }

    var newTypes = { }
    var types = this.types;
    _.each(types, function(value, key) {
        if (!value || (key == value)) {
            newTypes[key] = value;
            return;
        }

        var visited = [ key ];
        var result  = key;

        while (1) {
            var newResult = types[result];
            if (newResult == result) break;

            if (!newResult) break;
            result = newResult;

            if (visited.indexOf(result) >= 0) {
                Utils.throwError(OJError.CircularTypedefHierarchy, "Circular typedef hierarchy detected: '" + visited.join(",") + "'");
            }

            visited.push(result);
        }

        newTypes[key] = result;
    });
    this.types = newTypes;

    this.selectors = selectors;
}


hasGlobalChanges(other)
{
    function existanceChanged(a, b) {
        return !_.isEqual(
            _.keys(a).sort(),
            _.keys(b).sort()
        );
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
        existanceChanged(this.structs,   other.structs   ) ||
        existanceChanged(this.globals,   other.globals   ) ||
        existanceChanged(this.enums,     other.enums     ) ||
        existanceChanged(this.consts,    other.consts    ))
    {
        return true;
    }


    // Inlined @const and inlined @enum values also count as a global change
    //
    if (!_.isEqual(buildConstValueMap(this), buildConstValueMap(other))) {
        return true;
    }

    if (!_.isEqual(buildEnumValueMap(this), buildEnumValueMap(other))) {
        return true;
    }


    // Types duplicate existance information from classes (covered above),
    // but they also include @typedefs, so they need to be checked.
    //
    if (!_.isEqual(this.types, other.types)) {
        return true;
    }


    return false;
}


getChangedSelectorMap(other)
{
    var result = null;

    _.each(_.keys(this.selectors), selectorName => {
        if (!other.selectors[selectorName]) {
            if (!result) result = { };
            result[selectorName] = true;
        }
    });

    _.each(_.keys(other.selectors), selectorName => {
        if (!this.selectors[selectorName]) {
            if (!result) result = { };
            result[selectorName] = true;
        }
    });

    return result;
}


getAggregateClass()
{
    var result = new OJClass(null, null, null);

    function extractMethodsIntoMap(methods, map) {
        _.each(methods, function(m) {
            var selectorName = m.selectorName;
            var selectorType = m.selectorType;

            var types = _.clone(m.parameterTypes);
            types.unshift(m.returnType);

            var existing = map[selectorName];
            if (!existing) {
                map[selectorName] = types;
            } else {
                for (var i = 0, length = existing.length; i < length; i++) {
                    if (existing[i] != types[i]) {
                        existing[i] = "any";
                    }
                }
            }
        });
    }

    function addMethodsWithMap(map, selectorType) {
        _.each(map, function(value, key) {
            var returnType = value.shift();

            var variableNames = [ ];
            var index = 0;
            _.each(value, function(v) { variableNames.push("a" + index++);  });

            var m = new OJMethod(key, selectorType, returnType, value, variableNames);  
            result.addMethod(m);
        });
    }

    var instanceMap = { };
    var classMap    = { };

    _.each(this.classes, function(ojClass) {
        extractMethodsIntoMap(ojClass.getClassMethods(),    classMap);
        extractMethodsIntoMap(ojClass.getClassMethods(),    instanceMap);   // 'id' should also cover 'Class'
        extractMethodsIntoMap(ojClass.getInstanceMethods(), instanceMap);
    });

    addMethodsWithMap(classMap,    "+");
    addMethodsWithMap(instanceMap, "-");

    return result;
}


registerType(typesToRegister)
{
    if (!_.isArray(typesToRegister)) {
        typesToRegister = [ typesToRegister ];
    }

    for (var i = 0, length = typesToRegister.length; i < length; i++) {
        var type = typesToRegister[i];

        var currentValue = this.types[type];
        if (currentValue && (currentValue != type)) {
            Utils.throwError(OJError.TypeAlreadyExists, "Cannot register type '" + type + "', already declared as type '" + currentValue +  "'");
        }

        this.types[type] = type;
    }
}


aliasType(existing, newTypes)
{
    if (!_.isArray(newTypes)) {
        newTypes = [ newTypes ];
    }

    for (var i = 0, length = newTypes.length; i < length; i++) {
        var type = newTypes[i];

        var currentValue = this.types[type];
        if (currentValue && (currentValue != existing)) {
            Utils.throwError(OJError.TypeAlreadyExists, "Cannot alias type '" + type + "' to '" + existing + "', already registered as type '" + currentValue + "'");
        }

        this.types[type] = existing;
    }
}


addConst(ojConst)
{
    var name = ojConst.name;

    this.consts[name] = ojConst;
}


addEnum(ojEnum)
{
    var name = ojEnum.name;

    if (name) {
        this.aliasType("Number", ojEnum.name);
    } else {
        name = "$OJAnonymousEnum" + _.size(this.enums);

        ojEnum.name = name;
        ojEnum.anonymous = true;
    }

    this.enums[name] = ojEnum;
}


addClass(ojClass)
{
    var name     = ojClass.name;
    var existing = this.classes[name];

    if (existing) {
        if (existing.forward && !ojClass.forward) {
            this.classes[name] = ojClass;
            this.registerType(name);

        } else if (existing.placeholder && !ojClass.forward) {
            this.classes[name] = ojClass;
            this.registerType(name);

            // This was a category placeholder and is being replaced by the real class, move over methods
            _.each(existing.getAllMethods(), function(m) {
                ojClass.addMethod(m);
            });

        } else if (!existing.forward && !ojClass.forward) {
            Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of class '" + name + "'");
        }

    } else {
        this.classes[name] = ojClass;
        this.registerType(name);
    }
}


addProtocol(ojProtocol)
{
    var name = ojProtocol.name;

    if (this.protocols[name]) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of protocol '" + name + "'");
    }

    this.protocols[name] = ojProtocol;
}


addStruct(ojStruct)
{
    var name = ojStruct.name;

    if (this.structs[name]) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of struct '" + name + "'");
    }

    this.structs[name] = ojStruct;
}


addGlobal(ojGlobal)
{
    var name = ojGlobal.name;

    if (this.globals[name]) {
        Utils.throwError(OJError.DuplicateDeclaration, "Duplicate declaration of global '" + name + "'");
    }

    this.globals[name] = ojGlobal;
}


isNumericType(type)
{
    return this.types[type] == "Number";
}         


isBooleanType(type)
{
    return this.types[type] == "Boolean";
}


getSymbolTyper()
{
    return this._symbolTyper;
}


}


module.exports = OJModel;
