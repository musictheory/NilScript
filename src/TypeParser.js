/*
    This file is heavily based on acorn-typescript:
    https://github.com/TyrealHu/acorn-typescript
    MIT License


    
*/

import { Parser as AcornParser, tokTypes as tt, lineBreak } from "acorn";



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
        entity = this.finishNode(node, "TSQualifiedName");
    }

    return entity;
}


tsParseObjectTypeMembers()
{
    this.expect(tt.braceL);
    
    const members = [ ];
    
    while (this.type !== tt.braceR) {
        // Stopping point for now
        this.unexpected();
    }
    
    this.expect(tt.braceR);

    return members;
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
    return this.finishNode(node, "TSThisType");
}


tsParseTypeAnnotation(eatColon = true, t = this.startNode())
{
    let previousInType = this.tsInType;
    this.tsInType = true;
    if (eatColon) this.expect(tt.colon);
    t.typeAnnotation = this.tsParseType();
    this.tsInType = previousInType;

    return this.finishNode(t, "TSTypeAnnotation");
}


tsFillSignature(returnToken, signature)
{
    // Arrow fns *must* have return token (`=>`). Normal functions can omit it.
    const returnTokenRequired = returnToken === tt.arrow;

    if (this.tsMatchLeftRelational()) {
        // Disallow type parameters
        this.unexpected();
    }

    this.expect(tt.parenL);
    signature.parameters = this.tsParseBindingListForSignature();

    if (returnTokenRequired || this.type === returnToken) {
        this.expect(returnToken);
        signature.typeAnnotation = this.tsParseTypeAnnotation(/* eatColon */ false);
    }
}


tsParseFunctionOrConstructorType(type, abstract)
{
    const node = this.startNode();
    
    if (type === "TSConstructorType") {
        node.abstract = !!abstract
        if (abstract) this.next()
        this.next() // eat `new`
    }

    this.tsFillSignature(tt.arrow, node);
    
    return this.finishNode(node, type);
}


tsParseUnionOrIntersectionType(kind, parseConstituentType, operator)
{
    const node = this.startNode();
    const hasLeadingOperator = this.eat(operator);
    const types = [];

    do {
        types.push(parseConstituentType());
    } while (this.eat(operator));
    
    if (types.length === 1 && !hasLeadingOperator) {
        return types[0];
    }
    
    node.types = types;

    return this.finishNode(node, kind);
}


tsParseTypeOperator()
{
    const node = this.startNode();

    const operator = this.value;
    this.next(); // eat operator
    node.operator = operator;
    node.typeAnnotation = this.tsParseTypeOperatorOrHigher();

    return this.finishNode(node, "TSTypeOperator");
}


// tsParseConstraintForInferType() removed
// tsParseInferType() removed


tsParseLiteralTypeNode()
{
    const node = this.startNode();

    node.literal = (() => {
        switch (this.type) {
        case tt.num:
        case tt.string:
        case tt._true:
        case tt._false:
            // For compatibility to estree we cannot call parseLiteral directly here
            return this.parseExprAtom();
        default:
            this.unexpected();
        }
    })();

    return this.finishNode(node, "TSLiteralType");
}


// tsParseImportType() removed


tsParseTypeQuery()
{
    const node = this.startNode();

    this.expect(tt._typeof);
    
    if (this.type === tt._import) {
        this.unexpected(); // No import support
    } else {
        node.exprName = this.tsParseEntityName();
    }

    if (!this.tsHasPrecedingLineBreak() && this.tsMatchLeftRelational()) {
        node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSTypeQuery");
}


// tsParseMappedTypeParameter() removed
// tsParseMappedType() removed


tsParseTypeLiteral()
{
    const node = this.startNode();
    node.members = this.tsParseObjectTypeMembers();
    return this.finishNode(node, "TSTypeLiteral");
}


tsParseTupleElementType()
{
    const startLoc = this.startLoc;
    const startPos = this.start;
    const rest = this.eat(tt.ellipsis);

    let type = this.tsParseType();
    const optional = this.eat(tt.question);
    const labeled = this.eat(tt.colon);

    if (labeled) {
        // No labelled tuple element support
        this.unexpected();
    } else if (optional) {
        const optionalTypeNode = this.startNodeAt(type.start);
        optionalTypeNode.typeAnnotation = type;
        type = this.finishNode(optionalTypeNode, "TSOptionalType");
    }

    if (rest) {
        const restNode = this.startNodeAt(startPos, startLoc);
        restNode.typeAnnotation = type;
        type = this.finishNode(restNode, "TSRestType");
    }

    return type;
}


tsParseTupleType()
{
    const node = this.startNode();

    this.expect(tt.bracketL);

    node.elementTypes = this.tsParseDelimitedList(
        "TupleElementTypes",
        this.tsParseTupleElementType.bind(this)
    );

    this.expect(tt.bracketR);

    return this.finishNode(node, "TSTupleType");
}


// tsParseTemplateLiteralType() removed


tsParseTypeReference()
{
    const node = this.startNode();
    node.typeName = this.tsParseEntityName();

    if (!this.tsHasPrecedingLineBreak() && this.tsMatchLeftRelational()) {
        node.typeParameters = this.tsParseTypeArguments()
    }
    
    return this.finishNode(node, "TSTypeReference");
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
    node.typeAnnotation = this.tsParseType();
    this.expect(tt.parenR);
    return this.finishNode(node, "TSParenthesizedType");
}


tsParseNonArrayType()
{
    switch (this.type) {
    case tt.string:
    case tt.num:
    case tt._true:
    case tt._false:
        return this.tsParseLiteralTypeNode();

    case tt.plusMin:
        if (this.value === "-") {
            const node = this.startNode();
            const nextToken = this.lookahead();
            
            if (nextToken.type !== tt.num) {
                this.unexpected();
            }

            node.literal = this.parseMaybeUnary();
            return this.finishNode(node, "TSLiteralType");
        }
        break;

    case tt._this:
        // No type predicate support, only handle 'this'
        return this.tsParseThisTypeNode();

    case tt._typeof:
        return this.tsParseTypeQuery();
    
    case tt._import:
        this.unexpected(); // No import support

    case tt.braceL:
        // No mapped type support, only handle type literals
        this.tsParseTypeLiteral();

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

    while (!this.tsHasPrecedingLineBreak()) {
        if (this.eat(tt.bracketL)) {
            if (this.type === tt.bracketR) {
                const node = this.startNodeAt(type.start);
                node.elementType = type;
                this.expect(tt.bracketR);
                type = this.finishNode(node, "TSArrayType");

            } else {
                const node = this.startNode(type.start);
                node.objectType = type;
                node.indexType = this.tsParseType();
                this.expect(tt.bracketR);
                type = this.finishNode(node, "TSIndexedAccessType");
            }

        } else if (this.eat(tt.question)) {
            // See parsePostfixTypeOrHigher() in TypeScript's parser.ts
            const node = this.startNode(type.start);
            type = this.finishNode(node, "NullableType");

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
        "TSIntersectionType",
        this.tsParseTypeOperatorOrHigher.bind(this),
        tt.bitwiseAND
    );
}


tsParseUnionTypeOrHigher()
{
    return this.tsParseUnionOrIntersectionType(
        "TSUnionType",
        this.tsParseIntersectionTypeOrHigher.bind(this),
        tt.bitwiseOR
    );
}


tsParseNonConditionalType()
{
    if (this.tsIsStartOfFunctionType()) {
        return this.tsParseFunctionOrConstructorType("TSFunctionType");
    } 
    
    if (this.type === tt._new) {
        return this.tsParseFunctionOrConstructorType("TSConstructorType");
    }
    
    return this.tsParseUnionTypeOrHigher();
}



tsParseType()
{
    return this.tsParseNonConditionalType();
}


tsParseTypeArguments()
{
    const node = this.startNode();

    this.expect(tt.relational);
    node.params = this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
    this.exprAllowed = false
    this.expect(tt.relational)

    return this.finishNode(node, "TSTypeParameterInstantiation");
}


}

