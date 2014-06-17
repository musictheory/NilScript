/*
    traverser.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var esprima    = require && require("esprima-oj");
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
estraverse.VisitorKeys[ Syntax.OJAtSynthesizePair             ] = [ "id", "backing" ];
estraverse.VisitorKeys[ Syntax.OJAtDynamicDirective           ] = [ "ids" ];
estraverse.VisitorKeys[ Syntax.OJAtSelectorDirective          ] = [ ];
estraverse.VisitorKeys[ Syntax.OJConstDeclaration             ] = [ "declarations" ];
estraverse.VisitorKeys[ Syntax.OJEnumDeclaration              ] = [ "declarations" ];


function Traverser(ast)
{
    this._ast   = ast;
    this._nodes = [ ];
}

Traverser.SkipNode = 1;


Traverser.prototype.traverse = function(pre, post)
{
    var nodes = this._nodes;

    estraverse.traverse(this._ast, {
        enter: function (node, parent) {
            if (node.skip) {
                return estraverse.VisitorOption.Skip;
            }

            if (parent) {
                node.parent = parent;
            }

            nodes.push(node);

            if (pre(node, node.type)) {
                return estraverse.VisitorOption.Skip;
            }
        },

        leave: function (node, parent) {
            if (nodes[nodes.length - 1] == node) {
                nodes.pop();
            }

            post(node, node.type);
        }
    });
}


Traverser.prototype.getPath = function()
{
    return this._nodes.slice(0);
}


module.exports = {
    Traverser: Traverser
};
