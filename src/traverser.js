/*
    traverser.js
    Extends estraverse with ability to traverse oj nodes
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require("./esprima");
var estraverse = require("estraverse");
var Syntax     = esprima.Syntax;

// Add additional visitor keys for the oj language extension
var ojVisitorKeys = { };

ojVisitorKeys[ Syntax.OJMessageExpression            ] = [ "receiver", "messageSelectors" ];
ojVisitorKeys[ Syntax.OJMessageReceiver              ] = [ "value" ];
ojVisitorKeys[ Syntax.OJMessageSelector              ] = [ "name", "argument", "arguments" ];
ojVisitorKeys[ Syntax.OJMethodNameSegment            ] = [ ];
ojVisitorKeys[ Syntax.OJClassImplementation          ] = [ "id", "superclass", "ivarDeclarations", "body" ];
ojVisitorKeys[ Syntax.OJMethodDefinition             ] = [ "returnType", "methodSelectors", "body" ];
ojVisitorKeys[ Syntax.OJMethodSelector               ] = [ "name" ];
ojVisitorKeys[ Syntax.OJSelector                     ] = [ ];
ojVisitorKeys[ Syntax.OJParameterType                ] = [ ];
ojVisitorKeys[ Syntax.OJInstanceVariableDeclarations ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJInstanceVariableDeclaration  ] = [ "parameterType", "ivars" ];
ojVisitorKeys[ Syntax.OJAtPropertyDirective          ] = [ "attributes", "parameterType", "id" ];
ojVisitorKeys[ Syntax.OJAtPropertyAttribute          ] = [ ];
ojVisitorKeys[ Syntax.OJAtSynthesizeDirective        ] = [ "pairs" ];
ojVisitorKeys[ Syntax.OJAtClassDirective             ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJAtSqueezeDirective           ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJAtSynthesizePair             ] = [ "id", "backing" ];
ojVisitorKeys[ Syntax.OJAtDynamicDirective           ] = [ "ids" ];
ojVisitorKeys[ Syntax.OJAtSelectorDirective          ] = [ ];
ojVisitorKeys[ Syntax.OJConstDeclaration             ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJEnumDeclaration              ] = [ "declarations" ];
ojVisitorKeys[ Syntax.OJProtocolDefinition           ] = [ "id", "body" ];
ojVisitorKeys[ Syntax.OJMethodDeclaration            ] = [ "returnType", "methodSelectors" ];
ojVisitorKeys[ Syntax.OJIdentifierWithAnnotation     ] = [ "annotation" ];
ojVisitorKeys[ Syntax.OJAtCastExpression             ] = [ "id", "argument" ];
ojVisitorKeys[ Syntax.OJAtTypedefDeclaration         ] = [ "from", "to" ];
ojVisitorKeys[ Syntax.OJAtEachStatement              ] = [ "left", "right", "body" ];


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
