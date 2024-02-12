/*
    Traverser.js
    Extends estraverse with ability to traverse NilScript nodes
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import _ from "lodash";
import estraverse from "estraverse";

import { Syntax } from "./Parser.js";

// Add additional visitor keys for the NilScript language extension
const NSVisitorKeys = {
    [ Syntax.NSMessageExpression            ]: [ "receiver", "messageSelectors" ],
    [ Syntax.NSMessageReceiver              ]: [ "value" ],
    [ Syntax.NSMessageSelector              ]: [ "name", "argument", "arguments" ],
    [ Syntax.NSMethodNameSegment            ]: [ ],
    [ Syntax.NSClassImplementation          ]: [ "id", "ivarDeclarations", "body" ],
    [ Syntax.NSMethodDefinition             ]: [ "returnType", "methodSelectors", "body" ],
    [ Syntax.NSMethodSelector               ]: [ "name", "variableName" ],
    [ Syntax.NSSelector                     ]: [ ],
    [ Syntax.NSParameterType                ]: [ ],
    [ Syntax.NSPropertyDirective            ]: [ "attributes", "id" ],
    [ Syntax.NSPropertyAttribute            ]: [ ],
    [ Syntax.NSSelectorDirective            ]: [ ],
    [ Syntax.NSConstDeclaration             ]: [ "declarations" ],
    [ Syntax.NSEnumDeclaration              ]: [ "declarations" ],
    [ Syntax.NSProtocolDefinition           ]: [ "id", "body" ],
    [ Syntax.NSMethodDeclaration            ]: [ "returnType", "methodSelectors" ],
    [ Syntax.NSCastExpression               ]: [ "id", "argument" ],
    [ Syntax.NSAnyExpression                ]: [ "argument" ],
    [ Syntax.NSEachStatement                ]: [ "left", "right", "body" ],
    [ Syntax.NSTypeAnnotation               ]: [ ],
    [ Syntax.NSGlobalDeclaration            ]: [ "declaration", "declarators" ],
    [ Syntax.NSBridgedDeclaration           ]: [ "declaration" ],
    [ Syntax.NSTypeDefinition               ]: [ ],
    

    [ Syntax.PropertyDefinition             ]: [ "key", "value", "annotation" ],
    [ Syntax.NXClassDeclaration             ]: [ "id", "superClass", "body" ],
    [ Syntax.NXFuncDefinition               ]: [ "key", "params", "annotation", "body" ],
    [ Syntax.NXPropDefinition               ]: [ "key", "value", "annotation" ],
    [ Syntax.NXFuncParameter                ]: [ "labe", "name", "annotation" ],
    [ Syntax.NXNamedArgument                ]: [ "name", "argument" ],
    
    
    [ Syntax.ChainExpression                ]: [ "name", "expression" ],


};


// Patch FunctionExpression, FunctionDeclaration, and Identifier to deal with type annotations
//
(function() {
    function addAnnotationBeforeBody(key) {
        let children    = _.clone(estraverse.VisitorKeys[key]) || [ ];
        let indexOfBody = children.indexOf(children, "body");

        children.splice(indexOfBody, 0, "annotation");

        NSVisitorKeys[key] = children;
    }

    function addAnnotationAtEnd(key) {
        let children = _.clone(estraverse.VisitorKeys[key]);

        children.push("annotation");

        NSVisitorKeys[key] = children;
    }

    addAnnotationBeforeBody(Syntax.FunctionExpression);
    addAnnotationBeforeBody(Syntax.FunctionDeclaration);

    addAnnotationAtEnd(Syntax.Identifier);
}());



export class Traverser {

static SkipNode = estraverse.VisitorOption.Skip;

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
        keys:  NSVisitorKeys
    });
}


getParents()
{
    return this._controller.parents();
}

}

