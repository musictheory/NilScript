/*
    Traverser.js
    Extends estraverse with ability to traverse oj nodes
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const _          = require("lodash");
const esprima    = require("../ext/esprima");
const estraverse = require("estraverse");
const Syntax     = esprima.Syntax;

// Add additional visitor keys for the oj language extension
const ojVisitorKeys = {
    [ Syntax.OJMessageExpression            ]: [ "receiver", "messageSelectors" ],
    [ Syntax.OJMessageReceiver              ]: [ "value" ],
    [ Syntax.OJMessageSelector              ]: [ "name", "argument", "arguments" ],
    [ Syntax.OJMethodNameSegment            ]: [ ],
    [ Syntax.OJClassImplementation          ]: [ "id", "superclass", "ivarDeclarations", "body" ],
    [ Syntax.OJMethodDefinition             ]: [ "returnType", "methodSelectors", "body" ],
    [ Syntax.OJMethodSelector               ]: [ "name", "variableName" ],
    [ Syntax.OJSelector                     ]: [ ],
    [ Syntax.OJParameterType                ]: [ ],
    [ Syntax.OJInstanceVariableDeclarations ]: [ "declarations" ],
    [ Syntax.OJInstanceVariableDeclaration  ]: [ "parameterType", "ivars" ],
    [ Syntax.OJPropertyDirective            ]: [ "attributes", "id" ],
    [ Syntax.OJPropertyAttribute            ]: [ ],
    [ Syntax.OJObserveDirective             ]: [ "attributes", "ids" ],
    [ Syntax.OJObserveAttribute             ]: [ ],
    [ Syntax.OJSynthesizeDirective          ]: [ "pairs" ],
    [ Syntax.OJClassDirective               ]: [ "ids" ],
    [ Syntax.OJSqueezeDirective             ]: [ "ids" ],
    [ Syntax.OJSynthesizePair               ]: [ "id", "backing" ],
    [ Syntax.OJDynamicDirective             ]: [ "ids" ],
    [ Syntax.OJSelectorDirective            ]: [ ],
    [ Syntax.OJConstDeclaration             ]: [ "declarations" ],
    [ Syntax.OJEnumDeclaration              ]: [ "declarations" ],
    [ Syntax.OJProtocolDefinition           ]: [ "id", "body" ],
    [ Syntax.OJMethodDeclaration            ]: [ "returnType", "methodSelectors" ],
    [ Syntax.OJCastExpression               ]: [ "id", "argument" ],
    [ Syntax.OJAnyExpression                ]: [ "argument" ],
    [ Syntax.OJEachStatement                ]: [ "left", "right", "body" ],
    [ Syntax.OJTypeAnnotation               ]: [ ],
    [ Syntax.OJGlobalDeclaration            ]: [ "declaration", "declarators" ],
    [ Syntax.OJStructDefinition             ]: [ "id", "variables" ],
    [ Syntax.OJBridgedDeclaration           ]: [ "declaration" ],
    [ Syntax.OJTypeDefinition               ]: [ ],
};


// Patch FunctionExpression, FunctionDeclaration, and Identifier to deal with type annotations
//
(function() {
    function addAnnotationBeforeBody(key) {
        let children    = _.clone(estraverse.VisitorKeys[key]) || [ ];
        let indexOfBody = children.indexOf(children, "body");

        children.splice(indexOfBody, 0, "annotation");

        ojVisitorKeys[key] = children;
    }

    function addAnnotationAtEnd(key) {
        let children = _.clone(estraverse.VisitorKeys[key]);

        children.push("annotation");

        ojVisitorKeys[key] = children;
    }

    addAnnotationBeforeBody(Syntax.FunctionExpression);
    addAnnotationBeforeBody(Syntax.FunctionDeclaration);

    addAnnotationAtEnd(Syntax.Identifier);
}());



class Traverser {

constructor(ast)
{
    this._controller = new estraverse.Controller();
    this._ast = ast;
}


traverse(pre, post)
{
    this._controller.traverse(this._ast, {
        enter: pre,
        leave: post,
        keys:  ojVisitorKeys
    });
}


getParents()
{
    return this._controller.parents();
}

}


Traverser.SkipNode = estraverse.VisitorOption.Skip;

module.exports = Traverser;
