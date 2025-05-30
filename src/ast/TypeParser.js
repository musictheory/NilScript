/*
    This file is heavily based on acorn-typescript:
    https://github.com/TyrealHu/acorn-typescript
    MIT License
*/

import {
    Parser as AcornParser,
    tokTypes as tt,
    lineBreak
} from "acorn";

import { Syntax } from "./Tree.js";


function tokenIsIdentifier(token)
{
    return token == tt.name; //!FIXME
}


function nonNull(x)
{
    if (x == null) {
        throw new Error(`Unexpected ${x} value.`);
    }
    return x;
}


const sKeywordNames = new Set([
    "any", "boolean", "bigint", "never", "number", "null",
    "object", "string", "symbol", "undefined", "void"
]);


export class TypeParser extends AcornParser {

readToken_lt_gt(code)
{
    if (this.tsInType) {
        return this.finishOp(tt.relational, 1);
    }
    
    return super.readToken_lt_gt(code);
}


saveState()
{
    throw new Error("TypeParser is abstract and needs a saveState() implementation.");
}


restoreState(state)
{
    throw new Error("TypeParser is abstract and needs a restoreState() implementation.");
}


tsHasPrecedingLineBreak()
{
    return lineBreak.test(
        this.input.slice(this.lastTokEnd, this.start)
    );
}


tsParseBindingListForSignature()
{
    return super.parseBindingList(tt.parenR, true, true).map(pattern => {
        if (
            pattern.type !== "Identifier" &&
            pattern.type !== "RestElement" &&
            pattern.type !== "ObjectPattern" &&
            pattern.type !== "ArrayPattern"
        ) {
            this.unexpected(pattern.start);
        }

        return pattern;
    });
}


tsIsListTerminator(kind)
{
    switch (kind) {
    case "EnumMembers":
    case "TypeMembers":
        return this.type === tt.braceR;
    case "TupleElementTypes":
        return this.type === tt.bracketR;
    case "TypeParametersOrArguments":
        return this.tsMatchRightRelational();
    }
}


tsParseDelimitedListWorker(kind, parseElement, expectSuccess)
{
    const result = []
    let trailingCommaPos = -1;

    for (; ;) {
        if (this.tsIsListTerminator(kind)) {
            break;
        }
        trailingCommaPos = -1;

        const element = parseElement();
        if (element == null) {
            return undefined;
        }
        result.push(element);

        if (this.eat(tt.comma)) {
            trailingCommaPos = this.lastTokStart;
            continue;
        }

        if (this.tsIsListTerminator(kind)) {
            break;
        }

        if (expectSuccess) {
            // This will fail with an error about a missing comma
            this.expect(tt.comma);
        }

        return undefined;
    }

    return result;
}

      
tsParseDelimitedList(kind, parseElement)
{
    return nonNull(this.tsParseDelimitedListWorker(kind, parseElement, /* expectSuccess */ true));
}

      
tsLookAhead(f)
{
    // saveState() and restoreState() are implemented in Parser.js
    const state = this.saveState();
    const res = f();
    this.restoreState(state);
    return res;
}
      

tsParseEntityName()
{
    let entity = this.parseIdent(true);

    while (this.eat(tt.dot)) {
        const node = this.startNodeAt(entity.start);
        node.left = entity;
        node.right = this.parseIdent(true);
        entity = this.finishNode(node, Syntax.TSQualifiedName);
    }

    return entity;
}


tsSkipParameterStart()
{
    if (tokenIsIdentifier(this.type) || this.type === tt._this) {
        this.next();
        return true;
    }

    if (this.type === tt.braceL) {
        // Return true if we can parse an object pattern without errors
        try {
            this.parseObj(true);
            return true;
        } catch {
            return false;
        }
    }

    if (this.type === tt.bracketL) {
        this.next()
        
        try {
            this.parseBindingList(tt.bracketR, true, true);
            return true;
        } catch {
            return false
        }
    }

    return false;
}


tsIsUnambiguouslyStartOfFunctionType()
{
    this.next();

    if (this.type === tt.parenR || this.type === tt.ellipsis) {
          // ( )
          // ( ...
        return true;
    }

    if (this.tsSkipParameterStart()) {
        if (
            this.type === tt.colon ||
            this.type === tt.comma ||
            this.type === tt.question ||
            this.type === tt.eq
        ) {
            // ( xxx :
            // ( xxx ,
            // ( xxx ?
            // ( xxx =
            return true;
        }

        if (this.type === tt.parenR) {
            this.next();
            if (this.type === tt.arrow) {
                // ( xxx ) =>
                return true;
            }
        }
    }
    
    return false;
}


tsIsStartOfFunctionType()
{
    if (this.tsMatchLeftRelational()) {
        return true;
    }

    return (
          this.type === tt.parenL &&
          this.tsLookAhead(this.tsIsUnambiguouslyStartOfFunctionType.bind(this))
    );
}

      
tsParseThisTypeNode()
{
    const node = this.startNode();
    this.next();
    return this.finishNode(node, Syntax.TSThisType);
}


tsParseTypeAnnotation(eatColon = true, t = this.startNode())
{
    let previousInType = this.tsInType;
    this.tsInType = true;
    if (eatColon) this.expect(tt.colon);
    t.colon = eatColon;
    t.value = this.tsParseType();
    this.tsInType = previousInType;

    return this.finishNode(t, Syntax.TSTypeAnnotation);
}


tsFillSignature(returnToken, signature)
{
    const returnTokenRequired = returnToken === tt.arrow;

    if (this.tsMatchLeftRelational()) {
        // Disallow type parameters
        this.unexpected();
    }

    this.expect(tt.parenL);
    signature.params = this.tsParseBindingListForSignature();

    if (returnTokenRequired || this.type === returnToken) {
        this.expect(returnToken);
        signature.annotation = this.tsParseTypeAnnotation(/* eatColon */ false);
    }
}


tsParseFunctionType()
{
    const node = this.startNode();
    
    this.tsFillSignature(tt.arrow, node);
    
    return this.finishNode(node, Syntax.TSFunctionType);
}


tsParseUnionOrIntersectionType(kind, parseConstituentType, operator)
{
    const node = this.startNode();
    const hasLeadingOperator = this.eat(operator);
    const elements = [];

    do {
        elements.push(parseConstituentType());
    } while (this.eat(operator));
    
    if (elements.length === 1 && !hasLeadingOperator) {
        return elements[0];
    }
    
    node.elements = elements;

    return this.finishNode(node, kind);
}


tsParseTypeOperator()
{
    const node = this.startNode();

    const operator = this.value;
    this.next(); // eat operator
    node.operator = operator;
    node.argument = this.tsParseTypeOperatorOrHigher();

    return this.finishNode(node, Syntax.TSTypeOperator);
}


// tsParseConstraintForInferType() removed
// tsParseInferType() removed


tsParseLiteralTypeNode()
{
    const node = this.startNode();
    const errorPos = this.start;
    let literal;

    let type = this.type;
    if (
        type == tt.num    ||
        type == tt.string ||
        type == tt._true  ||
        type == tt._false ||
        (type == tt.plusMin && this.value == "-")
    ) {
        literal = this.parseMaybeUnary();
    } else {
        this.unexpected();
    }

    // Verify that literal is either Syntax.Liter
    let isNegativeNumber = (
        literal.type == Syntax.UnaryExpression &&
        literal.operator == "-" &&
        literal.argument.type == Syntax.Literal &&
        (typeof literal.argument.value == "number")
    );

    if (isNegativeNumber || (literal.type == Syntax.Literal)) {
        node.literal = literal;
    } else {
        this.unexpected(errorPos);
    }

    return this.finishNode(node, Syntax.TSLiteralType);
}


// tsParseImportType() removed


tsParseTypeQuery()
{
    const node = this.startNode();

    this.expect(tt._typeof);
    
    if (this.type === tt._import) {
        this.unexpected(); // No import support
    } else {
        node.name = this.tsParseEntityName();
    }

    if (!this.tsHasPrecedingLineBreak() && this.tsMatchLeftRelational()) {
        node.arguments = this.tsParseTypeArguments();
    }

    return this.finishNode(node, Syntax.TSTypeQuery);
}


// tsParseMappedTypeParameter() removed
// tsParseMappedType() removed

// TSObjectType is a simplified version of TSTypeLiteral
tsParseObjectType()
{
    const node = this.startNode();

    this.expect(tt.braceL);
    
    node.members = [ ];
    
    while (!this.eat(tt.braceR)) {
        const member = this.startNode();

        member.key = this.type == tt.string ?
            this.parseExprAtom() :
            this.parseIdent(true);
        
        member.optional = this.eat(tt.question);
        member.annotation = this.tsParseTypeAnnotation();
        
        node.members.push(this.finishNode(member, Syntax.TSObjectMember));
        
        if (this.type != tt.braceR) {
            this.expect(tt.comma);
        }
    }

    return this.finishNode(node, Syntax.TSObjectType);
}


tsParseTupleElementType()
{
    const startLoc = this.startLoc;
    const startPos = this.start;
    const rest = this.eat(tt.ellipsis);

    let type = this.tsParseType();
    const labeled = this.eat(tt.colon);

    if (labeled) {
        // No labelled tuple element support
        this.unexpected();
    }

    if (rest) {
        const restNode = this.startNodeAt(startPos, startLoc);
        restNode.argument = type;
        type = this.finishNode(restNode, Syntax.TSRestType);
    }

    return type;
}


tsParseTupleType()
{
    const node = this.startNode();

    this.expect(tt.bracketL);

    node.elements = this.tsParseDelimitedList(
        "TupleElementTypes",
        this.tsParseTupleElementType.bind(this)
    );

    this.expect(tt.bracketR);

    return this.finishNode(node, Syntax.TSTupleType);
}


// tsParseTemplateLiteralType() removed


tsParseTypeReference()
{
    const node = this.startNode();
    const name = this.tsParseEntityName();
    
    node.name = name;
    
    if (!sKeywordNames.has(name.name) && !this.tsHasPrecedingLineBreak() && this.tsMatchLeftRelational()) {
        node.arguments = this.tsParseTypeArguments()
    }
    
    return this.finishNode(node, Syntax.TSTypeReference);
}


tsMatchLeftRelational()
{
    return this.type === tt.relational && this.value === "<";
}


tsMatchRightRelational()
{
    return this.type === tt.relational && this.value === ">";
}


tsParseParenthesizedType()
{
    const node = this.startNode();
    this.expect(tt.parenL);
    node.argument = this.tsParseType();
    this.expect(tt.parenR);
    return this.finishNode(node, Syntax.TSParenthesizedType);
}


tsParseNonArrayType()
{
    switch (this.type) {
    case tt.string:
    case tt.num:
    case tt._true:
    case tt._false:
    case tt.plusMin:
        return this.tsParseLiteralTypeNode();

    case tt._this:
        // No type predicate support, only handle 'this'
        return this.tsParseThisTypeNode();

    case tt._typeof:
        return this.tsParseTypeQuery();
    
    case tt._import:
        this.unexpected(); // No import support

    case tt.braceL:
        // No mapped type support, only handle type literals
        return this.tsParseObjectType();

    case tt.bracketL:
        return this.tsParseTupleType();
        
    case tt.parenL:
        return this.tsParseParenthesizedType();

    case tt.backQuote:
    case tt.dollarBraceL:
        return this.unexpected(); // No template literal support
    
    default:
        {
            if (
                this.type !== tt._void &&
                this.type !== tt._null &&
                !tokenIsIdentifier(this.type)
            ) {
                this.unexpected();
            }

            // Rather than TSVoidKeyword / TSStringKeyword / etc, we pass everything
            // to tsParseTypeReference() and use Identifier nodes
            return this.tsParseTypeReference();
        }
    }
}


tsParseArrayTypeOrHigher()
{
    let type = this.tsParseNonArrayType();

    const makeNullable = (inType) => {
        const node = this.startNode(inType.start);
        node.argument = inType;
        return this.finishNode(node, Syntax.NXNullableType);
    };

    while (!this.tsHasPrecedingLineBreak()) {
        if (this.eat(tt.bracketL)) {
            if (this.type === tt.bracketR) {
                const node = this.startNodeAt(type.start);
                node.element = type;
                this.expect(tt.bracketR);
                type = this.finishNode(node, Syntax.TSArrayType);
                
                // Allow Foo[]?
                if (this.eat(tt.question)) {
                    type = makeNullable(type);
                    console.log(type);
                }

            } else {
                const node = this.startNode(type.start);
                node.object = type;
                node.property = this.tsParseType();
                this.expect(tt.bracketR);
                type = this.finishNode(node, Syntax.TSIndexedAccessType);
            }

        } else if (this.eat(tt.question)) {
            // See parsePostfixTypeOrHigher() in TypeScript's parser.ts
            type = makeNullable(type);

        } else {
            break;
        }
    }
    
    return type;
}


tsParseTypeOperatorOrHigher()
{
    if (this.type == tt.name && this.value == "readonly" && !this.containsEsc) {
        return this.tsParseTypeOperator();
    }
    
    return this.tsParseArrayTypeOrHigher();
}
      

tsParseIntersectionTypeOrHigher()
{
    return this.tsParseUnionOrIntersectionType(
        Syntax.TSIntersectionType,
        this.tsParseTypeOperatorOrHigher.bind(this),
        tt.bitwiseAND
    );
}


tsParseUnionTypeOrHigher()
{
    return this.tsParseUnionOrIntersectionType(
        Syntax.TSUnionType,
        this.tsParseIntersectionTypeOrHigher.bind(this),
        tt.bitwiseOR
    );
}


tsParseNonConditionalType()
{
    if (this.tsIsStartOfFunctionType()) {
        return this.tsParseFunctionType();
    } 
    
    if (this.type === tt._new) {
        this.unexpected();
    }
    
    return this.tsParseUnionTypeOrHigher();
}


tsParseType()
{
    return this.tsParseNonConditionalType();
}


tsParseTypeArguments()
{
    this.expect(tt.relational);
    let results = this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
    this.exprAllowed = false
    this.expect(tt.relational)

    return results;
}


}

