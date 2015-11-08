/*
    OJModel.js
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var _             = require("lodash");
var OJError       = require("../errors").OJError;
var Utils         = require("../utils");
var OJClass       = require("./OJClass");
var OJGlobal      = require("./OJGlobal");
var OJProtocol    = require("./OJProtocol");
var OJMethod      = require("./OJMethod");
var OJEnum        = require("./OJEnum");
var OJSymbolTyper = require("./OJSymbolTyper")


function OJModel()
{
    this.enums     = [ ];
    this.globals   = { };
    this.consts    = { };
    this.classes   = { };
    this.protocols = { };
    this.selectors = { };

    this._symbolTyper = new OJSymbolTyper(this);
    this._globalsMap = null;

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


OJModel.prototype.loadState = function(state)
{
    var enums     = this.enums;
    var classes   = this.classes;
    var globals   = this.globals;
    var protocols = this.protocols;
    var types     = this.types;

    _.each(state.enums, function(e) {
        enums.push(new OJEnum(e.name, e.unsigned, e.values));
    });

    _.extend(this.consts, state.consts);
    _.extend(this.types,  state.types);

    _.each(state.globals, function(g) {
        var ojGlobal = new OJGlobal();
        ojGlobal.loadState(g);
        ojGlobal.local = false;
        globals[ojGlobal.name] = ojGlobal;
    });

    _.each(state.classes, function(c) {
        var ojClass = new OJClass();
        ojClass.loadState(c);
        ojClass.local = false;
        classes[ojClass.name] = ojClass;
    });

    _.each(state.protocols, function(p) {
        var ojProtocol = new OJProtocol();
        ojProtocol.loadState(p);
        ojProtocol.local = false;
        protocols[ojProtocol.name] = ojProtocol;
    });

    if (state.symbols) {
        this._symbolTyper.loadState(state.symbols);
    }
}


OJModel.prototype.saveState = function()
{
    return {
        symbols:   this._symbolTyper.saveState(),

        consts:    this.consts,
        enums:     this.enums,
        selectors: this.selectors,
        types:     this.types,

        globals: _.map(this.globals, function(ojGlobal) {
            return ojGlobal.saveState();
        }),

        classes: _.map(this.classes, function(ojClass) {
            return ojClass.saveState();
        }),

        protocols: _.map(this.protocols, function(ojProtocol) {
            return ojProtocol.saveState();
        })
    }
}


OJModel.prototype.prepare = function()
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


OJModel.prototype.getAggregateClass = function()
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
        extractMethodsIntoMap(ojClass.getInstanceMethods(), instanceMap);
    });

    addMethodsWithMap(classMap,    "+");
    addMethodsWithMap(instanceMap, "-");

    return result;
}


OJModel.prototype.registerType = function(typesToRegister)
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


OJModel.prototype.aliasType = function(existing, newTypes)
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


OJModel.prototype.addConst = function(name, value)
{
    this.consts[name] = value;
}


OJModel.prototype.addEnum = function(e)
{
    this.enums.push(e);
    this.aliasType("Number", e.name);
}


OJModel.prototype.addClass = function(ojClass)
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
            Utils.throwError(OJError.DuplicateClassDefinition, "Duplicate declaration of class '" + name + "'");
        }

    } else {
        this.classes[name] = ojClass;
        this.registerType(name);
    } 
}


OJModel.prototype.addProtocol = function(ojProtocol)
{
    var name = ojProtocol.name;

    if (this.protocols[name]) {
        Utils.throwError(OJError.DuplicateProtocolDefinition, "Duplicate declaration of protocol '" + name + "'");
    }

    this.protocols[name] = ojProtocol;
}


OJModel.prototype.addGlobal = function(ojGlobal)
{
    var name = ojGlobal.name;

    if (this.protocols[name]) {
        Utils.throwError(OJError.DuplicateGlobalDefinition, "Duplicate declaration of global '" + name + "'");
    }

    this.globals[name] = ojGlobal;
}


OJModel.prototype.isNumericType = function(t)
{
    return this.types[t] == "Number";
}         


OJModel.prototype.isBooleanType = function(t)
{
    return this.types[t] == "Boolean";
}


OJModel.prototype.getSymbolTyper = function()
{
    return this._symbolTyper;
}


module.exports = OJModel;
