/*
    traverser.js
    Extends estraverse with ability to traverse oj nodes
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require("./esprima");
var estraverse = require("estraverse");
var Syntax     = esprima.Syntax;

// Add additional VisitorKeys for the oj language extension
estraverse.VisitorKeys[ Syntax.OJMessageExpression            ] = [ "receiver", "messageSelectors" ];
estraverse.VisitorKeys[ Syntax.OJMessageReceiver              ] = [ "value" ];
estraverse.VisitorKeys[ Syntax.OJMessageSelector              ] = [ "name", "argument", "arguments" ];
estraverse.VisitorKeys[ Syntax.OJMethodNameSegment            ] = [ ];
estraverse.VisitorKeys[ Syntax.OJClassImplementation          ] = [ "id", "superclass", "ivarDeclarations", "body" ];
estraverse.VisitorKeys[ Syntax.OJMethodDefinition             ] = [ "returnType", "methodSelectors", "body" ];
estraverse.VisitorKeys[ Syntax.OJMethodSelector               ] = [ "name" ];
estraverse.VisitorKeys[ Syntax.OJSelector                     ] = [ ];
estraverse.VisitorKeys[ Syntax.OJParameterType                ] = [ ];
estraverse.VisitorKeys[ Syntax.OJInstanceVariableDeclarations ] = [ "declarations" ];
estraverse.VisitorKeys[ Syntax.OJInstanceVariableDeclaration  ] = [ "parameterType", "ivars" ];
estraverse.VisitorKeys[ Syntax.OJAtPropertyDirective          ] = [ "attributes", "parameterType", "id" ];
estraverse.VisitorKeys[ Syntax.OJAtPropertyAttribute          ] = [ ];
estraverse.VisitorKeys[ Syntax.OJAtSynthesizeDirective        ] = [ "pairs" ];
estraverse.VisitorKeys[ Syntax.OJAtClassDirective             ] = [ "ids" ];
estraverse.VisitorKeys[ Syntax.OJAtSqueezeDirective           ] = [ "ids" ];
estraverse.VisitorKeys[ Syntax.OJAtSynthesizePair             ] = [ "id", "backing" ];
estraverse.VisitorKeys[ Syntax.OJAtDynamicDirective           ] = [ "ids" ];
estraverse.VisitorKeys[ Syntax.OJAtSelectorDirective          ] = [ ];
estraverse.VisitorKeys[ Syntax.OJConstDeclaration             ] = [ "declarations" ];
estraverse.VisitorKeys[ Syntax.OJEnumDeclaration              ] = [ "declarations" ];
estraverse.VisitorKeys[ Syntax.OJProtocolDefinition           ] = [ "id", "body" ];
estraverse.VisitorKeys[ Syntax.OJMethodDeclaration            ] = [ "returnType", "methodSelectors" ];
estraverse.VisitorKeys[ Syntax.OJIdentifierWithAnnotation     ] = [ "annotation" ];
estraverse.VisitorKeys[ Syntax.OJAtCastExpression             ] = [ "id", "argument" ];


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
        leave: post
    });
}


Traverser.prototype.getParents = function()
{
    return this._controller.parents();
}


module.exports = Traverser;
