/*
    traverser.js
    Extends estraverse with ability to traverse oj nodes
    (c) 2013-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const esprima    = require("../ext/esprima");
const estraverse = require("estraverse");
const Syntax     = esprima.Syntax;

// Add additional visitor keys for the oj language extension
var ojVisitorKeys = { };

ojVisitorKeys[ Syntax.OJMessageExpression            ] = [ "receiver", "messageSelectors" ];
ojVisitorKeys[ Syntax.OJMessageReceiver              ] = [ "value" ];
ojVisitorKeys[ Syntax.OJMessageSelector              ] = [ "name", "argument", "arguments" ];
ojVisitorKeys[ Syntax.OJMethodNameSegment            ] = [ ];
ojVisitorKeys[ Syntax.OJClassImplementation          ] = [ "id", "superclass", "ivarDeclarations", "body" ];
ojVisitorKeys[ Syntax.OJMethodDefinition             ] = [ "returnType", "methodSelectors", "body" ];
ojVisitorKeys[ Syntax.OJMethodSelector               ] = [ "name", "variableName" ];
ojVisitorKeys[ Syntax.OJSelector                     ] = [ ];
ojVisitorKeys[ Syntax.OJParameterType                ] = [ ];
ojVisitorKeys[ Syntax.OJBracketVariableBlock         ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJBracketVariableDeclaration   ] = [ "parameterType", "ids" ];
ojVisitorKeys[ Syntax.OJPropertyDirective            ] = [ "attributes", "parameterType", "id" ];
ojVisitorKeys[ Syntax.OJPropertyAttribute            ] = [ ];
ojVisitorKeys[ Syntax.OJSynthesizeDirective          ] = [ "pairs" ];
ojVisitorKeys[ Syntax.OJClassDirective               ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJSqueezeDirective             ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJSynthesizePair               ] = [ "id", "backing" ];
ojVisitorKeys[ Syntax.OJDynamicDirective             ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJSelectorDirective            ] = [ ];
ojVisitorKeys[ Syntax.OJConstDeclaration             ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJEnumDeclaration              ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJProtocolDefinition           ] = [ "id", "body" ];
ojVisitorKeys[ Syntax.OJMethodDeclaration            ] = [ "returnType", "methodSelectors" ];
ojVisitorKeys[ Syntax.OJCastExpression               ] = [ "id", "argument" ];
ojVisitorKeys[ Syntax.OJAnyExpression                ] = [ "argument" ];
ojVisitorKeys[ Syntax.OJTypedefDeclaration           ] = [ "from", "to" ];
ojVisitorKeys[ Syntax.OJEachStatement                ] = [ "left", "right", "body" ];
ojVisitorKeys[ Syntax.OJTypeAnnotation               ] = [ ];
ojVisitorKeys[ Syntax.OJGlobalDeclaration            ] = [ "declaration", "declarators" ];
ojVisitorKeys[ Syntax.OJStructDefinition             ] = [ "id", "variables" ];

// Patch FunctionExpression, FunctionDeclaration, and Identifier to deal with type annotations
//
(function() {
    function addAnnotationBeforeBody(key) {
        var children    = _.clone(estraverse.VisitorKeys[key]) || [ ];
        var indexOfBody = children.indexOf(children, "body");

        children.splice(indexOfBody, 0, "annotation");

        ojVisitorKeys[key] = children;
    }

    function addAnnotationAtEnd(key) {
        var children = _.clone(estraverse.VisitorKeys[key]);

        children.push("annotation");

        ojVisitorKeys[key] = children;
    }

    addAnnotationBeforeBody(Syntax.FunctionExpression);
    addAnnotationBeforeBody(Syntax.FunctionDeclaration);

    addAnnotationAtEnd(Syntax.Identifier);
}());


function Traverser(ast)
{
    this._controller = new estraverse.Controller();
    this._ast = ast;
}


Traverser.SkipNode = estraverse.VisitorOption.Skip;


Traverser.prototype.traverse = function(pre, post)
{
    this._controller.traverse(this._ast, {
        enter: pre,
        leave: post,
        keys:  ojVisitorKeys
    });
}


Traverser.prototype.getParents = function()
{
    return this._controller.parents();
}


module.exports = Traverser;
