/*
    This file is heavily based on acorn-typescript:
    https://github.com/TyrealHu/acorn-typescript
    MIT License


*/

import {
    tokTypes as tt,
    lineBreak,
    keywordTypes, TokenType, isIdentifierStart } from "acorn";
import { TypeParser } from "./TypeParser.js";

function kw(name, options = {}) {
    options.keyword = name
    return keywordTypes[name] = new TokenType(name, options)
}

tt._atAny      = kw("@any");
tt._atBridged  = kw("@bridged");
tt._atCast     = kw("@cast");
tt._atClass    = kw("@class");
tt._atConst    = kw("@const");
tt._atEnd      = kw("@end");
tt._atEnum     = kw("@enum");
tt._atGlobal   = kw("@global");
tt._atProtocol = kw("@protocol");
tt._atType     = kw("@type");

export class Parser extends TypeParser {


readToken = function(code)
{
    if (isIdentifierStart(code, true) || code === 92 /* '\' */) {
        return this.readWord()
    } else if (code == 64) {
        return this.nsReadAtKeyword();
    }
    
    return this.getTokenFromCode(code)
}


saveState()
{
    return {
        pos: this.pos,
        type: this.type,
        start: this.start,
        end: this.end,
        startLoc: this.startLoc,
        endLoc: this.endLoc,
        lastTokStart: this.lastTokStart,
        lastTokEnd: this.lastTokEnd,
        lastTokStartLoc: this.lastTokStartLoc,
        lastTokEndLoc: this.lastTokEndLoc,
        exprAllowed: this.exprAllowed,
        lineStart: this.lineStart,
        curLine: this.curLine
    };
}


restoreState(state)
{
    Object.assign(this, state);
}


parseBindingAtom()
{
    let result = super.parseBindingAtom();

    if (this.type == tt.colon && result.type == "Identifier") {
        result.typeAnnotation = this.tsParseTypeAnnotation();
    }

    return result;
}

parseFunctionBody(node, isArrowFunction, isMethod, forInit)
{
    if (this.type == tt.colon) {
        node.typeAnnotation = this.tsParseTypeAnnotation();
    }

    super.parseFunctionBody(node, isArrowFunction, isMethod, forInit);
}


parseVarId(decl, kind)
{
    super.parseVarId(decl, kind);

    if (this.type == tt.colon) {
        decl.typeAnnotation = this.tsParseTypeAnnotation();
    }
}


parseParenItem(item)
{
    let result = super.parseParenItem(item);

    if (this.type == tt.colon) {
        result.typeAnnotation = this.tsParseTypeAnnotation();
    }

    return result;
}


parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse)
{
    const node = this.startNode();
    let result = super.parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse);

    if (
        this.nsAllowNamedArguments &&
        this.type == tt.colon &&
        result.type == "Identifier"
    ) {
        const colonNode = this.startNode();
        this.next();
        
        node.name = result;
        node.colon = this.finishNode(colonNode);
        node.argument = super.parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse);

        return this.finishNode(node, "NXNamedArgument");
    }

    return result;
}


parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors)
{
    let oldAllowNamedArguments = this.nsAllowNamedArguments;

    if (close == tt.parenR) this.nsAllowNamedArguments = true;
    let result = super.parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors);
    if (close == tt.parenR) this.nsAllowNamedArguments = oldAllowNamedArguments;
    
    return result;
}


parseMaybeUnary(sawUnary)
{
    if (this.type == tt._atCast) {
        return this.nsParseCastExpression();
    } else if (this.type == tt._atAny) {
        return this.nsParseAnyExpression();
    } else {
        return super.parseMaybeUnary(sawUnary);
    }
}


nsParseTypeDefinition()
{
    const node = this.startNode();
    const params = [];

    let annotation = null;

    this.expect(tt._atType);

    node.name = this.parseIdent().name;

    const finishIdentifierWithAnnotation = (node, name) => {

        let optional = this.eat(tt.question);
        node.typeAnnotation = this.tsParseTypeAnnotation();
        node.typeAnnotation.optional = optional;

        return this.finishNode(node, "Identifier");
    }

    const parseIdentifierWithAnnotation = () => {
        const node = this.startNode();
        return finishIdentifierWithAnnotation(node, this.parseIdent().name);
    };

    this.expect(tt.eq);

    if (this.eat(tt.braceL)) {
        node.kind = "object";

        while (!this.eat(tt.braceR)) {
            params.push(parseIdentifierWithAnnotation());

            if (this.type != tt.braceR) {
                this.expect(tt.comma);
            }
        }

    } else if (this.eat(tt.bracketL)) {
        node.kind = "tuple";

        while (!this.eat(tt.bracketR)) {
            const node = this.startNode();
            params.push(finishIdentifierWithAnnotation(node, "" + params.length));

            if (this.type != tt.bracketR) {
                this.expect(tt.comma);
            }
        }

    } else if (this.eat(tt._function)) {
        node.kind = "function";
        
        this.expect(tt.parenL);

        while (!this.eat(tt.parenR)) {
            params.push(parseIdentifierWithAnnotation());

            if (this.type != tt.parenR) {
                this.expect(',');
            }
        }

        node.typeAnnotation = this.tsParseTypeAnnotation();

    } else if (this.type == tt.name) {
        node.kind = "alias";
        node.typeAnnotation = this.tsParseTypeAnnotation(false);

    } else {
        this.unexpected();
    }

    this.semicolon();

    return this.finishNode(node, "NSTypeDefinition");
}

nsParseProtocolDefinitionBody()
{
    const bodyNode = this.startNode();

    while (!this.eat(tt._atEnd)) {
        let node = this.createNode();

        if (this.eatContextual("func")) {
            node.key = this.parseIdent(true);
            node.optional = this.eat(tt.question);
            node.params = [ ];
            
            this.expect(tt.parenL);

            while (!this.eat(tt.parenR)) {
                node.params.push(this.nsParseFuncParameter());
            
                if (this.match(',')) {
                    this.expect(',');
                }
            }
                
            node.typeAnnotation = null;
            if (this.type == tt.colon) {
                node.typeAnnotation = this.tsParseTypeAnnotation();
            }

            this.semicolon();

            bodyNode.body.push(this.finishNode(node, "NXFuncDefinition"));

        } else {
            this.unexpected();
        }
    }

    return this.finishNode(bodyNode, "BlockStatement");
}


nsParseProtocolDefinition()
{
    const node = this.startNode();

    const oldStrict = this.strict;
    this.strict = true;

    this.expect(tt._atProtocol);

    node.id = this.parseIdent();
    node.body = this.nsParseProtocolDefinitionBody();

    this.expect(tt._atEnd);

    this.strict = previousStrict;

    return this.finishNode(node, "NSProtocolDefinition");
}


nsParseCastExpression()
{
    const node = this.startNode();

    this.expect(tt._atCast);

    this.expect(tt.parenL);
    node.id = this.tsParseType();
    this.expect(tt.comma);

    node.argument = this.parseExpression();

    this.expect(tt.parenR);

    return this.finishNode(node, "NSCastExpression");
}


nsParseAnyExpression()
{
    const node = this.startNode();

    this.expect(tt._atAny);

    this.expect(tt.parenL);
    node.argument = this.parseExpression();
    this.expect(tt.parenR);

    return this.finishNode(node, "NSAnyExpression");
}
    

nsParseConstDeclaration()
{
    const node = this.startNode();
    
    this.expect(tt._atConst);

    this.parseVar(node, false, "NSConst", true);

    this.semicolon();

    return this.finishNode(node, "NSConstDeclaration");
}
    

nsParseEnumMember()
{
    const node = this.startNode();
    node.id   = this.parseIdent();
    node.init = null;

    if (this.eat(tt.eq)) {
        node.init = this.parseMaybeAssign();
    }

    return this.finishNode(node, "VariableDeclarator");
}


nsParseEnumDeclaration()
{
    const node = this.startNode();
    node.declarations = [];
    node.id = null;

    this.expect(tt._atEnum);
    
    if (this.type != tt.braceL) {
        node.id = this.parseIdent();
    }

    this.expect(tt.braceL);
    
    while (!this.eat(tt.braceR)) {
        node.declarations.push(this.nsParseEnumMember());
        if (this.type != tt.braceR) this.expect(tt.comma);
    }

    this.semicolon();

    return this.finishNode(node, "NSEnumDeclaration");
}
    

nsParseGlobalDeclaration()
{
    const node = this.startNode();

    this.expect(tt._atGlobal);

    if (this.type == tt._function) {
        const functionNode = this.startNode();
        this.next();
        node.declaration = this.parseFunction(functionNode, true);

    } else {
        this.parseVar(node, false, "NSGlobal", true);
    }

    return this.finishNode(node, "NSGlobalDeclaration");
}
    

nsParseBridgedDeclaration()
{
    const node = this.startNode();

    this.expect(tt._atBridged);

    if (this.type == tt._atConst) {
        node.declaration = this.nsParseConstDeclaration();
    } else if (this.type == tt._atEnum) {
        node.declaration = this.nsParseEnumDeclaration();
    } else {
        this.unexpected();
    }

    return this.finishNode(node, "NSBridgedDeclaration");
}


parseClassElement(constructorAllowsSuper)
{
    const node = this.startNode();

    let state;
 
    const eat = (name) => {
        if (this.value === name && this.eat(tt.name)) {
            if (!state) state = this.saveState();
            return true;
        }

        return false;
    };

    let isStatic   = eat("static");
    let isAsync    = eat("async");
    let isReadonly = eat("readonly");
    let isPrivate  = !isReadonly && eat("private");
    let isObserved = !isReadonly && !isPrivate && eat("observed");

    if (this.eatContextual("prop")) {
        let modifier = null;

        if      (isPrivate)  modifier = "private";
        else if (isReadonly) modifier = "readonly";
        else if (isObserved) modifier = "observed";

        return this.nsParseProp(node, isStatic, modifier);

    } else if (this.eatContextual("func")) {
        return this.nsParseFunc(node, isStatic, isAsync);

    } else {
        if (state) this.restoreState(state);
        return super.parseClassElement(constructorAllowsSuper);
    }
}


nsParseProp(node, isStatic, modifier)
{
    node.static   = isStatic;
    node.modifier = modifier;

    node.key = this.parseIdent(true);

    node.typeAnnotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;

    this.semicolon();

    return this.finishNode(node, "NXPropDefinition")
}


nsParseFuncParameter()
{
    const node = this.startNode();
   
    let labelOrName = this.parseIdent(true);

    let label;
    let name;

    if (this.type == tt.colon) {
        label = null;
        name = labelOrName;
    } else {
        label = labelOrName;
        name = this.parseIdent(true);
    }
    
    node.label = label;
    node.name = name;
    node.typeAnnotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;

    return this.finishNode(node, "NXFuncParameter");
}


nsParseFunc(node, isStatic, isAsync)
{
    node.static = isStatic;
    node.async = isAsync;

    node.key = this.parseIdent(true);
    node.params = [ ];

    this.expect(tt.parenL);

    let needsComma = false;
    while (!this.eat(tt.parenR)) {
        if (needsComma) this.expect(tt.comma);
        node.params.push(this.nsParseFuncParameter());
        needsComma = true;
    }
    
    node.typeAnnotation = this.tsParseTypeAnnotation();

    let flags = 66; // 2(SCOPE_FUNCTION) + 64(SCOPE_SUPER)
    if (isAsync) flags += 4; // SCOPE_ASYNC

    this.enterScope(flags);

    node.body = this.parseBlock();

    this.exitScope();

    return this.finishNode(node, "NXFuncDefinition");
}


parseStatement(context, topLevel, exports)
{
    switch(this.type) {
    case tt._atClass:
        return this.nsParseAtClass();
    case tt._atProtocol:
        return this.nsParseProtocolDefinition();
    case tt._atBridged:
        return this.nsParseBridgedDeclaration();
    case tt._atConst:
        return this.nsParseConstDeclaration();
    case tt._atEnum:
        return this.nsParseEnumDeclaration();
    case tt._atGlobal:
        return this.nsParseGlobalDeclaration();
    case tt._atType:
        return this.nsParseTypeDefinition();
    default:
        return super.parseStatement(context, topLevel, exports);
    }
}


nsReadAtKeyword()
{
    this.pos++;
    let word = "@" + this.readWord1();
    let type = tt.name;
    
    if (keywordTypes[word]) {
        type = keywordTypes[word];
    }

    return this.finishToken(type, word);
}


nsParseClassImplementationBody()
{
    const node = this.startNode();

    node.body = [ ];

    while (1) {
        const type = this.type;
        const value = this.value;
        
        if (type == tt._atEnd) {
            break;
        
        } else if (type == tt.name && (
            value == "static"   ||
            value == "private"  ||
            value == "readonly" ||
            value == "observed" ||
            value == "prop"     ||
            value == "func"     ||
            value == "get"      ||
            value == "set"
        )) {
            node.body.push(this.parseClassElement(false));

        } else {
            this.unexpected();
        }
    }

    return this.finishNode(node, "BlockStatement")
}


nsParseAtClass()
{
    const node = this.startNode();

    let wasStrict = this.strict;
    this.strict = true;

    this.expect(tt._atClass);

    node.id = this.parseIdent();

    node.superClass = null;
    if (this.type == tt._extends) {
        this.nextToken();
        node.superClass = this.parseIdent();
    }
        
    node.interfaces = [ ];
    if (this.eatContextual("implements")) {
        node.interfaces.push(this.parseIdent());

        while (this.eat(tt.comma)) {
            node.interfaces.push(this.parseIdent());
        }
    }

    node.body = this.nsParseClassImplementationBody();

    this.expect(tt._atEnd);

    this.strict = wasStrict;

    return this.finishNode(node, "NSClassImplementation")
}


}
