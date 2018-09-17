/*
    FunctionMapper.js
    (c) 2016-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const esprima    = require("../ext/esprima");
const Syntax     = esprima.Syntax;

const Traverser  = require("./Traverser");
const Utils      = require("./Utils");
const Model      = require("./model");



module.exports = class FunctionMapper {

constructor(file)
{
    this._file = file;
}


map()
{
    let ojFile = this._file;

    let traverser  = new Traverser(ojFile.ast);
    let currentClassName = null;

    let entryStack = [ ];
    let entryList = [ ];
    let currentEntryName = null;

    function _pushEntry(node, name)
    {
        let lineNumber = (node.loc && node.loc.start && node.loc.start.line) || 0;
        entryStack.push({ line: lineNumber, name: name });

        if (name && (name != currentEntryName)) {
            entryList.push( [ lineNumber, name ] );
            currentEntryName = name;
        }
    }

    function _popEntry(node)
    {
        let lineNumber = (node.loc && node.loc.end && node.loc.end.line) || 0;

        entryStack.pop();

        let last = _.last(entryStack);
        let name = last ? last.name : null;

        if (name != currentEntryName) {
            entryList.push([ lineNumber + 1, name ]);
            currentEntryName = name;
        }
    }

    function handleNSClassImplementation(node)
    {
        currentClassName = node.id.name;
    }

    function handleNSMethodDefinition(node)
    {
        let selectorType = node.selectorType;
        let selectorName = node.selectorName;
        _pushEntry(node, `${selectorType}[${currentClassName} ${selectorName}]`);
    }

    function handleFunctionDeclaration(node)
    {
        let name = node.id && node.id.name;
        _pushEntry(node, name);
    }

    function handleFunctionExpression(node, parent)
    {
        let id   = node.id;
        let name = id && id.name;

        if (!id) {
            if (parent.type === Syntax.VariableDeclarator) {
                name = parent.id && parent.id.name;
            }
        }

        _pushEntry(node, name);
    }

    traverser.traverse(function(node, parent) {
        let type = node.type;

        try {
            if (type === Syntax.NSClassImplementation) {
                handleNSClassImplementation(node);

            } else if (type === Syntax.NSMethodDefinition) {
                handleNSMethodDefinition(node);

            } else if (type === Syntax.FunctionDeclaration) {
                handleFunctionDeclaration(node);

            } else if (type === Syntax.FunctionExpression || type === Syntax.ArrowFunctionExpression) {
                handleFunctionExpression(node, parent);
            }

        } catch (e) {
            throw e;
        }

    }, function(node, parent) {
        let type = node.type;

        if (type === Syntax.NSClassImplementation) {
            currentClassName = null;

        } else if (type === Syntax.NSMethodDefinition  ||
                   type === Syntax.FunctionDeclaration ||
                   type === Syntax.FunctionExpression  ||
                   type === Syntax.ArrowFunctionExpression)
        {
            _popEntry(node);
        }
    });

    return entryList;
}

}
