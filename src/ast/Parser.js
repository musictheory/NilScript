/*
    This file is heavily based on acorn-typescript:
    https://github.com/TyrealHu/acorn-typescript
    MIT License


*/

import {
    tokTypes as tt,
    lineBreak,
    keywordTypes, TokenType, isIdentifierStart
} from "acorn";

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

static parse(contents, options)
{
    return super.parse(contents, options ?? {
        ecmaVersion: 2021,
        sourceType: "module",
        locations: true
    });
}


saveState()
{
    return {
        pos: this.pos,
        type: this.type,
        start: this.start,
        end: this.end,
        value: this.value,
        startLoc: this.startLoc,
        endLoc: this.endLoc,
        lastTokStart: this.lastTokStart,
        lastTokEnd: this.lastTokEnd,
        lastTokStartLoc: this.lastTokStartLoc,
        lastTokEndLoc: this.lastTokEndLoc,
        context: this.context.slice(0),
        exprAllowed: this.exprAllowed,
        lineStart: this.lineStart,
        curLine: this.curLine
    };
}


restoreState(state)
{
    Object.assign(this, state);
}

readToken(code)
{
    if (isIdentifierStart(code, true) || code === 92 /* '\' */) {
        return this.readWord()
    } else if (code == 64) {
        return this.nsReadAtKeyword();
    }
    
    return this.getTokenFromCode(code)
}


parseBindingAtom()
{
    let result = super.parseBindingAtom();

    if (this.type == tt.colon && result.type == "Identifier") {
        // result.typeAnnotation = this.tsParseTypeAnnotation();
        result.annotation = this.ns_parseTypeAnnotation();
        this.finishNode(result, "Identifier");
    }

    return result;
}


shouldParseExportStatement()
{
    return (
        this.isContextual("enum") ||
        super.shouldParseExportStatement()
    );
}


parseImport(node)
{
    this.next()

    if (this.type === tt.string) {
        node.specifiers = [ ];
        node.source = this.parseExprAtom();

    } else {
        node.specifiers = this.parseImportSpecifiers();

        if (this.eatContextual("from")) {
            node.source = this.type === tt.string ? this.parseExprAtom() : this.unexpected();
        }
    }

    this.semicolon();

    return this.finishNode(node, "ImportDeclaration");
}


parseFunctionBody(node, isArrowFunction, isMethod, forInit)
{
    if (this.type == tt.colon) {
//        node.typeAnnotation = this.tsParseTypeAnnotation();
        node.annotation = this.ns_parseTypeAnnotation({ allowVoid: true });
    }

    super.parseFunctionBody(node, isArrowFunction, isMethod, forInit);
}


parseParenItem(item)
{
    let result = super.parseParenItem(item);

    if (this.type == tt.colon) {
        // result.typeAnnotation = this.tsParseTypeAnnotation();
        result.annotation = this.ns_parseTypeAnnotation();
    }

    return result;
}


parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors)
{
    let elts = [], first = true;

    while (!this.eat(close)) {
        if (!first) {
            this.expect(tt.comma);
            if (allowTrailingComma && this.afterTrailingComma(close)) break;
        } else {
            first = false;
        }

        let elt;
        if (allowEmpty && this.type === tt.comma) {
            elt = null;
        } else if (this.type === tt.ellipsis) {
            elt = this.parseSpread(refDestructuringErrors);

            if (refDestructuringErrors && this.type === tt.comma && refDestructuringErrors.trailingComma < 0) {
                refDestructuringErrors.trailingComma = this.start;
            }

        } else {
            if (close == tt.parenR && ((this.type == tt.name) || this.type.keyword)) {
                const namedArgument = this.startNode();

                let state = this.saveState();
                let name = this.parseIdent(true);
                
                if (this.type == tt.colon) {
                    const colonNode = this.startNode();
                    this.next();

                    namedArgument.name = name;
                    namedArgument.colon = this.finishNode(colonNode, "NXColon");
                    namedArgument.argument = this.parseMaybeAssign(false, refDestructuringErrors);

                    elt = this.finishNode(namedArgument, "NXNamedArgument");

                } else {
                    this.restoreState(state);
                    elt = this.parseMaybeAssign(false, refDestructuringErrors);
                }
            
            } else {
                elt = this.parseMaybeAssign(false, refDestructuringErrors);
            }
        }

        elts.push(elt);
    }

    return elts;
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


ns_parseTypeAngleSuffix()
{
    const parts = [];
    let angles = 0;

    const appendNameAngle = () => {
        let name = this.parseIdent().name;
        
        while (this.eat(tt.bracketL)) {
            this.expect(tt.bracketR);
            name += "[]";
        }
        
        parts.push(name);

        if (this.type == tt.relational && this.value == "<") {
            appendAngle();
        }
    }

    const appendAngle = () => {
        this.next();  // Consume '<'
        parts.push('<');
        angles++;

        // It's possible a recursive call will handle a '>>' or '>>>' in the stream,
        // so save angles...
        let savedAngles = angles;

        appendNameAngle();

        while (angles > 0 && this.eat(tt.comma)) {
            parts.push(',');
            appendNameAngle();
        }

        // ...and check savedAngles here.  If angles is lower, a '>>' or '>>>' already handled our '>'
        if (angles >= savedAngles) {
            if (angles >= 1 && this.type == tt.relational && this.value == ">") {
                this.expect(tt.relational);
                parts.push('>');
                angles -= 1;

            } else if (angles >= 2 && this.type == tt.bitShift && this.value == ">>") {
                this.expect(tt.bitShift);
                parts.push('>>');
                angles -= 2;

            } else if (angles >= 3 && this.type == tt.bitShift && this.value == ">>>") {
                this.expect(tt.bitShift);
                parts.push('>>>');
                angles -= 3;

            } else {
                this.unexpected();
            }
        }
    }

    let isLessThan = this.type == tt.relational && this.value == "<";
    if (!isLessThan) return "";
    appendAngle();

    return parts.join("");
}


ns_parseType(options)
{
    let name = "";

    if (options && options.allowVoid && this.type == tt._void) {
        this.next();
        name = "void";

    } else if (this.type == tt._this) {
        this.next();
        name = "this";

    } else if (
        this.type == tt._true ||
        this.type == tt._false ||
        this.type == tt._null ||
        this.type == tt.num ||
        this.type == tt.string
    ) {
        name += this.input.slice(this.start, this.end);
        this.next(); 
           
    } else {
        name = this.parseIdent().name;
    }

    if (this.type == tt.relational && this.value == "<") {
        name += this.ns_parseTypeAngleSuffix();
    }

    while (this.eat(tt.bracketL)) {
        this.expect(tt.bracketR);
        name += "[]";
    }

    if (this.eat(tt.bitwiseOR)) {
        name += "|" + this.ns_parseType(options);
    }

    return name;
}


ns_parseTypeAnnotation(options)
{
    const node = this.startNode();
    let optional = false;

    if (options && options.allowOptional) {
        if (this.eat(tt.question)) {
            node.optional = true;
        }
    }

    this.expect(tt.colon);
    node.value = this.ns_parseType(options);
    return this.finishNode(node, "NSTypeAnnotation");
}


ns_parseIdentifierWithAnnotation(options)
{
    const node = this.startNode();

    node.name = this.parseIdent(options.liberal).name;
    if (!node.name) this.unexpected();

    node.annotation = this.ns_parseTypeAnnotation(options);
    return this.finishNode(node, "Identifier");
}


nsParseTypeDefinition()
{
    const node = this.startNode();
    const params = [];

    this.expect(tt._atType);

    node.name = this.parseIdent().name;
    node.params = params;

    this.expect(tt.eq);

    if (this.eat(tt.braceL)) {
        node.kind = "object";

        while (!this.eat(tt.braceR)) {
            params.push(this.ns_parseIdentifierWithAnnotation({ allowOptional: true, liberal: true }));

            if (this.type != tt.braceR) {
                this.expect(tt.comma);
            }
        }

    } else if (this.eat(tt.bracketL)) {
        node.kind = "tuple";

        while (!this.eat(tt.bracketR)) {
            const node = this.startNode();

            node.name = "" + params.length;
            node.annotation = {
                type: "NSTypeAnnotation",
                value: this.ns_parseType(),
                optional: false
            };

            params.push(this.finishNode(node, "Identifier"));

            if (this.type != tt.bracketR) {
                this.expect(tt.comma);
            }
        }

    } else if (this.eat(tt._function)) {
        node.kind = "function";
        
        this.expect(tt.parenL);

        while (!this.eat(tt.parenR)) {
            params.push(this.ns_parseIdentifierWithAnnotation({ allowOptional: true }));

            if (this.type != tt.parenR) {
                this.expect(tt.comma);
            }
        }

        node.annotation = this.ns_parseTypeAnnotation({ allowVoid: true });

    } else if (this.type == tt.name) {
        node.kind = "alias";
        node.annotation = {
            type: "NSTypeAnnotation",
            value: this.ns_parseType(),
            optional: false
        };

    } else {
        this.unexpected();
    }

    this.semicolon();

    return this.finishNode(node, "NSTypeDefinition");
}

nsParseProtocolDefinitionBody()
{
    const bodyNode = this.startNode();
    bodyNode.body = [ ];

    while (!this.eat(tt._atEnd)) {
        let node = this.startNode();

        if (this.eatContextual("func")) {
            node.key = this.parseIdent(true);
            node.optional = this.eat(tt.question);
            node.params = [ ];
            
            this.expect(tt.parenL);

            while (!this.eat(tt.parenR)) {
                node.params.push(this.nsParseFuncParameter());
            
                if (this.type != tt.parenR) {
                    this.expect(tt.comma);
                }
            }
                
            // node.typeAnnotation = null;
            // if (this.type == tt.colon) {
            //     node.typeAnnotation = this.tsParseTypeAnnotation();
            // }

            node.annotation = null;
            if (this.type == tt.colon) {
                node.annotation = this.ns_parseTypeAnnotation({ allowVoid: true });
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

    this.strict = oldStrict;

    return this.finishNode(node, "NSProtocolDefinition");
}


nsParseCastExpression()
{
    const node = this.startNode();

    this.expect(tt._atCast);

    this.expect(tt.parenL);
    // node.id = this.tsParseType();
    node.id = this.ns_parseType();
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

    if (!this.eatContextual("enum")) {
        this.expect(tt._atEnum);
    }

    node.id = this.parseIdent();

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
        if (this.value === name && this.type == tt.name) {
            if (!state) state = this.saveState();
            this.next();
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

    // node.typeAnnotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;
    node.annotation = (this.type == tt.colon) ? this.ns_parseTypeAnnotation() : null;

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
    // node.typeAnnotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;
    node.annotation = (this.type == tt.colon) ? this.ns_parseTypeAnnotation() : null;

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
    
    // node.typeAnnotation = this.tsParseTypeAnnotation();
    if (this.type == tt.colon) {
        node.annotation = this.ns_parseTypeAnnotation({ allowVoid: true });
    }

    let flags = 66; // 2(SCOPE_FUNCTION) + 64(SCOPE_SUPER)
    if (isAsync) flags += 4; // SCOPE_ASYNC

    this.enterScope(flags);

    node.body = this.parseBlock();

    this.exitScope();

    return this.finishNode(node, "NXFuncDefinition");
}


parseStatement(context, topLevel, exports)
{
    if (this.isContextual("enum")) {
        return this.nsParseEnumDeclaration();
    }
    
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
