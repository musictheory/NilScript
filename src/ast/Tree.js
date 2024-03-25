/*
    Traverser.js
    Extends estraverse with ability to traverse NilScript nodes
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

const ESTreeStructure = {
    AssignmentExpression:     [ "left", "right" ],
    AssignmentPattern:        [ "left", "right" ],
    ArrayExpression:          [ "elements" ],
    ArrayPattern:             [ "elements" ],
    ArrowFunctionExpression:  [ "params", "body" ],
    AwaitExpression:          [ "argument" ],
    BlockStatement:           [ "body" ],
    BinaryExpression:         [ "left", "right" ],
    BreakStatement:           [ "label" ],
    CallExpression:           [ "callee", "arguments" ],
    CatchClause:              [ "param", "body" ],
    ChainExpression:          [ "expression" ],
    ClassBody:                [ "body" ],
    ClassDeclaration:         [ "id", "superClass", "body" ],
    ClassExpression:          [ "id", "superClass", "body" ],
    ConditionalExpression:    [ "test", "consequent", "alternate" ],
    ContinueStatement:        [ "label" ],
    DebuggerStatement:        [ ],
    DoWhileStatement:         [ "body", "test" ],
    EmptyStatement:           [ ],
    ExportAllDeclaration:     [ "source" ],
    ExportDefaultDeclaration: [ "declaration" ],
    ExportNamedDeclaration:   [ "declaration", "specifiers", "source" ],
    ExportSpecifier:          [ "exported", "local" ],
    ExpressionStatement:      [ "expression" ],
    ForStatement:             [ "init", "test", "update", "body" ],
    ForInStatement:           [ "left", "right", "body" ],
    ForOfStatement:           [ "left", "right", "body" ],
    FunctionDeclaration:      [ "id", "params", "body" ],
    FunctionExpression:       [ "id", "params", "body" ],
    Identifier:               [ ],
    IfStatement:              [ "test", "consequent", "alternate" ],
    ImportExpression:         [ "source" ],
    ImportDeclaration:        [ "specifiers", "source" ],
    ImportDefaultSpecifier:   [ "local" ],
    ImportNamespaceSpecifier: [ "local" ],
    ImportSpecifier:          [ "imported", "local" ],
    Literal:                  [ ],
    LabeledStatement:         [ "label", "body" ],
    LogicalExpression:        [ "left", "right" ],
    MemberExpression:         [ "object", "property" ],
    MetaProperty:             [ "meta", "property" ],
    MethodDefinition:         [ "key", "value" ],
    ModuleSpecifier:          [ ],
    NewExpression:            [ "callee", "arguments" ],
    ObjectExpression:         [ "properties" ],
    ObjectPattern:            [ "properties" ],
    PrivateIdentifier:        [ ],
    Program:                  [ "body"],
    Property:                 [ "key", "value" ],
    PropertyDefinition:       [ "key", "value" ],
    RestElement:              [ "argument" ],
    ReturnStatement:          [ "argument" ],
    SequenceExpression:       [ "expressions" ],
    SpreadElement:            [ "argument" ],
    Super:                    [ ],
    SwitchStatement:          [ "discriminant", "cases" ],
    SwitchCase:               [ "test", "consequent" ],
    TaggedTemplateExpression: [ "tag", "quasi" ],
    TemplateElement:          [ ],
    TemplateLiteral:          [ "quasis", "expressions" ],
    ThisExpression:           [ ],
    ThrowStatement:           [ "argument" ],
    TryStatement:             [ "block", "handler", "finalizer" ],
    UnaryExpression:          [ "argument" ],
    UpdateExpression:         [ "argument" ],
    VariableDeclaration:      [ "declarations" ],
    VariableDeclarator:       [ "id", "init" ],
    WhileStatement:           [ "test", "body" ],
    WithStatement:            [ "object", "body" ],
    YieldExpression:          [ "argument" ]
};


const NilScriptTreeStructure = {
    NSClassImplementation: [ "id", "body" ],
    NSConstDeclaration:    [ "declarations" ],
    NSEnumDeclaration:     [ "declarations" ],
    NSProtocolDefinition:  [ "id", "body" ],
    NSCastExpression:      [ "argument" ],
    NSAnyExpression:       [ "argument" ],
    NSTypeAnnotation:      [ ],
    NSGlobalDeclaration:   [ "declaration", "declarations" ],
    NSBridgedDeclaration:  [ "declaration" ],
    NSTypeDefinition:      [ ],
    
    NXClassDeclaration:    [ "id", "superClass", "body" ],
    NXFuncDefinition:      [ "key", "params", "annotation", "body" ],
    NXPropDefinition:      [ "key", "value", "annotation" ],
    NXFuncParameter:       [ "label", "name", "annotation" ],
    NXNamedArgument:       [ "name", "argument" ],
    NXNamedArgumentColon:  [  ],
};


/*
    The ESTree AST uses "type" to indicate a Node's type; TypeScript's AST
    uses "kind". This causes naming conflicts when porting TypeScript nodes
    to our syntax.
    
    Naming Rules:
    1) If a type's node structure resembles an existing ESTree structure,
       match the ESTree structure.
    2) Remove "type" as a prefix or suffix. "objectType" becomes "type".
    3) "types" of a collection becomes "elements".
    4) "type" referencing a return value becomes "annotation".
    5) "type" referencing an operator-like argument becomes "argument".
*/
const TypeAnnotationTreeStructure = {
    NullableType:        [ "argument" ],

    TSArrayType:         [ "element" ],
    TSConstructorType:   [ "params", "annotation" ],
    TSFunctionType:      [ "params", "annotation" ],
    TSIndexedAccessType: [ "object", "property" ],
    TSIntersectionType:  [ "elements" ],
    TSLiteralType:       [ "literal" ],
    TSLiteralType:       [ ],
    TSOptionalType:      [ "argument" ],
    TSParenthesizedType: [ "argument" ],
    TSQualifiedName:     [ "left", "right" ],
    TSRestType:          [ "argument" ],
    TSThisType:          [ ],
    TSTupleType:         [ "elements" ],
    TSTypeAnnotation:    [ "value" ],
    TSTypeOperator:      [ "operator", "argument" ],
    TSTypeQuery:         [ "name", "arguments" ],
    TSTypeReference:     [ "name", "arguments" ],
    TSUnionType:         [ "elements" ],
};


export const TreeStructure = Object.assign({ },
    ESTreeStructure,
    NilScriptTreeStructure,
    TypeAnnotationTreeStructure
);


// Extend ESTree nodes to include "annotation"
{
    function addAfter(array, existing, value) {
        array.splice(array.indexOf(existing), 0, value);
    }

    addAfter( TreeStructure.FunctionDeclaration, "params", "annotation" );
    addAfter( TreeStructure.FunctionExpression,  "params", "annotation" );

    TreeStructure.Identifier.push("annotation");
    TreeStructure.PropertyDefinition.push("annotation");
}


export const Syntax = Object.fromEntries(Object.keys(TreeStructure).map(x => [ x, x ]));
