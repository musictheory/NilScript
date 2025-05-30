/*
    
*/

import { TreeStructure, Syntax } from "./Tree.js";


function _text(c, str)
{
    c.push(str);
}


function _args(c, args, options)
{
    if (!args) return;

    _text(c, "<");
    _list(c, args, ", ", options);
    _text(c, ">");
}


function _list(c, nodes, separator, options)
{
    if (!nodes) return;
    
    for (let i = 0; i < nodes.length; i++) {
        if (i) _text(c, separator);
        _node(c, nodes[i], options);
    }    
}


function _node(c, node, options)
{
    let type = node.type;
        
    if (type == Syntax.NXNullableType) {
        if (options?.forTuple) {
            _node(c, node.argument),
            _text(c, "?");
        } else {
            _text(c, "(");
            _node(c, node.argument);
            _text(c, " | null)");
        }

    } else if (type == Syntax.UnaryExpression) {
        _text(c, "-");
        _node(c, node.argument);
        
    } else if (type == Syntax.Literal) {
        _text(c, node.raw);

    } else if (type == Syntax.Identifier) {
        _text(c, node.name);

        if (node.annotation) {
            _node(c, node.annotation);
        }

    } else if (type == Syntax.TSArrayType) {
        _node(c, node.element);
        _text(c, "[]");

    } else if (type == Syntax.TSFunctionType) {
        _text(c, "(");
        _list(c, node.params, ", ");
        _text(c, ") => ");
        _node(c, node.annotation);

    } else if (type == Syntax.TSIndexedAccessType) {
        _node(c, node.object);
        _text(c, "[");
        _node(c, node.property);
        _text(c, "]");

    } else if (type == Syntax.TSIntersectionType) {
        _list(c, node.elements, " & ");

    } else if (type == Syntax.TSLiteralType) {
        _node(c, node.literal);

    } else if (type == Syntax.TSObjectMember) {
        _node(c, node.key);
        if (node.optional) _text(c, "?");
        _node(c, node.annotation);

    } else if (type == Syntax.TSObjectType) {
        _text(c, "{ ");
        _list(c, node.members, ", ");
        _text(c, " }");

    } else if (type == Syntax.TSParenthesizedType) {
        _text(c, "(");
        _node(c, node.argument);
        _text(c, ")");
        
    } else if (type == Syntax.TSQualifiedName) {
        _node(c, node.left);
        _text(c, ".");
        _node(c, node.right);

    } else if (type == Syntax.TSRestType) {
        _text(c, "...");
        _node(c, node.argument);
    
    } else if (type == Syntax.TSThisType) {
        _text(c, "this");

    } else if (type == Syntax.TSTupleType) {
        _text(c, "[ ");
        _list(c, node.elements, ", ", { forTuple: true });
        _text(c, " ]");

    } else if (type == Syntax.TSTypeAnnotation) {
        if (node.colon) _text(c, ": ");
        _node(c, node.value);

    } else if (type == Syntax.TSTypeOperator) {
        _text(c, node.operator);
        _text(c, " ");
        _node(c, node.argument);
        
    } else if (type == Syntax.TSTypeQuery) {
        _text(c, "typeof ");
        _node(c, node.name);
        _args(c, node.arguments);
                
    } else if (type == Syntax.TSTypeReference) {
        _node(c, node.name);
        _args(c, node.arguments);

    } else if (type == Syntax.TSUnionType) {
        _list(c, node.elements, " | ");

    } else {
        throw new Error("Unknown node type: " + type);
    }
}


export class TypePrinter {

static print(node, allowColonPrefix)
{
    if (!node) {
        throw new Error("TypePrinter.print() called with null node");
    }

    if (node.type != Syntax.TSTypeAnnotation) {
        throw new Error("TypePrinter.print() called with node type of: " + node.type);
    }

    let components = (allowColonPrefix && node.colon) ? [ ": " ] : [ ];
    _node(components, node.value);

    return components.join("");
}

}

