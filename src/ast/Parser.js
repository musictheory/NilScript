/*
    Parser.js
    Nyx extensions to acorn's parser
    (c) 2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import {
    tokTypes as tt,
    lineBreak,
    TokenType, isIdentifierStart
} from "acorn";

import { Syntax } from "./Tree.js";
import { TypeParser } from "./TypeParser.js";


tt.atId = new TokenType("atId", { startsExpr: true });


export class Parser extends TypeParser {

static parse(contents, options)
{
    return super.parse(contents, options ?? {
        ecmaVersion: 2022,
        sourceType: "module",
        locations: true,
        checkPrivateFields: false
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
    } else if (code === 64) {
        return this.nxReadToken_at();
    }
    
    return this.getTokenFromCode(code)
}


parseBindingAtom()
{
    let result = super.parseBindingAtom();

    if (result.type == Syntax.Identifier) {
        if (this.type == tt.question && this.nxAllowOptionalIdent) {
            result.optional = true;
            result.question = this.nxParsePunctuation();

            this.finishNode(result, Syntax.Identifier);
        }

        if (this.type == tt.colon) {
            result.annotation = this.tsParseTypeAnnotation();
            this.finishNode(result, Syntax.Identifier);
        }
    }

    return result;
}


parseClassField(node)
{
    // check for optional, if in interface
    // check for colon and parse type
    if (this.nxInInterface && this.eat(tt.question)) {
        node.optional = true;
        
        if (this.type == tt.parenL) {
            super.parseClassMethod(node, false, false, false);
            return;
        }
    }

    if (this.type == tt.colon) {
        node.annotation = this.tsParseTypeAnnotation();
    }

    super.parseClassField(node);
}


parseFunctionParams(node)
{
    let previousAllowOptionalIdent = this.nxAllowOptionalIdent;
    this.nxAllowOptionalIdent = true;
    
    super.parseFunctionParams(node);
    
    this.nxAllowOptionalIdent = previousAllowOptionalIdent
}


parseClassMethod(method, isGenerator, isAsync, allowsDirectSuper)
{
    if (this.nxInInterface) {
        method.optional = this.eat(tt.question);
    }

    super.parseClassMethod(method, isGenerator, isAsync, allowsDirectSuper);
}


shouldParseExportStatement()
{
    return (
        this.isContextual("enum") ||
        this.isContextual("type") ||
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

    return this.finishNode(node, Syntax.ImportDeclaration);
}


parseFunctionBody(node, isArrowFunction, isMethod, forInit)
{
    if (this.type == tt.colon) {
        node.annotation = this.tsParseTypeAnnotation();
    }
    
    // Allow body-less functions and methods
    if (!isArrowFunction && (this.type !== tt.braceL)) {
        this.exitScope();
    } else {
        super.parseFunctionBody(node, isArrowFunction, isMethod, forInit);
    }
}


parseParenItem(item)
{
    let result = super.parseParenItem(item);

    if (this.type == tt.colon) {
        result.annotation = this.tsParseTypeAnnotation();
    }

    return result;
}


parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit)
{
    if (
        this.value == "!" &&
        this.type == tt.prefix &&
        !this.tsHasPrecedingLineBreak()
    ) {
        const node = this.startNodeAt(startPos, startLoc);

        node.expression = base;
        this.next();

        return this.finishNode(node, Syntax.NXNonNullExpression);
    }
    
    return super.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
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
                    namedArgument.name = name;
                    namedArgument.colon = this.nxParsePunctuation();
                    namedArgument.argument = this.parseMaybeAssign(false, refDestructuringErrors);

                    elt = this.finishNode(namedArgument, Syntax.NXNamedArgument);

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


parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit)
{
    if (
        (tt._in.binop > minPrec) &&
        this.isContextual("as") &&
        !this.tsHasPrecedingLineBreak()
    ) {
        const node = this.startNodeAt(leftStartPos, leftStartLoc);
        
        node.expression = left;
        this.expectContextual("as");
        node.annotation = this.tsParseTypeAnnotation(false);

        // See reScan_lt_gt() in acorn-typescript
        if (this.type === tt.relational) {
            this.pos -= 1;
            this.readToken_lt_gt(this.fullCharCodeAtPos());
        }
        
        this.finishNode(node, Syntax.NXAsExpression);
        
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);

    } else {
        return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit);
    }
}


nxReadToken_at() // '@'
{
    ++this.pos;
    let code = this.fullCharCodeAtPos();

    if (isIdentifierStart(code, true) || code === 92 /* '\' */) {
        return this.finishToken(tt.atId, this.readWord1())
    }

    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'")
}


nxParsePunctuation()
{
    const node = this.startNode();
    this.next();
            
    return this.finishNode(node, Syntax.NXPunctuation);
}
 

nxMaybeParseTypeDefinition()
{
    const state = this.saveState();
    
    const node = this.startNode();
    const params = [];

    this.eatContextual("type");
    
    if (this.type != tt.name) {
        this.restoreState(state);
        return null;
    }

    node.id = this.parseIdent();
    node.params = params;

    this.expect(tt.eq);
    
    node.annotation = this.tsParseTypeAnnotation(false);

    this.semicolon();

    return this.finishNode(node, Syntax.NXTypeDeclaration);
}


nxMaybeParseGlobalDefinition()
{
    const state = this.saveState();
    
    const node = this.startNode();
    const params = [];

    this.eatContextual("global");

    if (this.type != tt._function && this.type != tt._const) {
        this.restoreState(state);
        return null;
    }

    if (this.type == tt._function) {

        const functionNode = this.startNode();
        this.next();
        node.declaration = this.parseFunction(functionNode, true);
    
    } else if (this.type == tt._const) {
        const constNode = this.startNode();
        node.declaration = this.parseVarStatement(constNode, "const");
    }

    return this.finishNode(node, Syntax.NXGlobalDeclaration);
}


nxParseEnumMember()
{
    const node = this.startNode();
    node.id   = this.parseIdent();
    node.init = null;

    if (this.eat(tt.eq)) {
        node.init = this.parseMaybeAssign();
    }

    return this.finishNode(node, Syntax.NXEnumMember);
}


nxParseEnumDeclaration()
{
    const node = this.startNode();

    this.expectContextual("enum");

    node.id = this.parseIdent();
    node.members = [];

    this.expect(tt.braceL);
    
    while (!this.eat(tt.braceR)) {
        node.members.push(this.nxParseEnumMember());
        if (this.type != tt.braceR) this.expect(tt.comma);
    }

    this.semicolon();

    return this.finishNode(node, Syntax.NXEnumDeclaration);
}


nxParseInterfaceDeclaration()
{
    const state = this.saveState();

    const node = this.startNode();

    this.expectContextual("interface");
    
    if (this.type != tt.name) {
        this.restoreState(state);
        return null;
    }

    let previousInInterface = this.nxInInterface;
    this.nxInInterface = true;

    const previousStrict = this.strict;
    this.strict = true;
      
    node.id = this.parseIdent();
    
    let interfaceBody = this.startNode();
    interfaceBody.body = [ ];

    this.expect(tt.braceL);

    while (this.type !== tt.braceR) {
        let element = this.parseClassElement(false);
        if (element) {
            interfaceBody.body.push(element);
        }
    }

    this.next();

    node.body = this.finishNode(interfaceBody, Syntax.NXInterfaceBody);

    this.nxInInterface = previousInInterface;
    this.strict = previousStrict;

    return this.finishNode(node, Syntax.NXInterfaceDeclaration);
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

    let canBeProp = !isAsync;

    // This is a temporary hack to allow decorator-style syntax before 'prop'
    let decorator = null;
    if (canBeProp && (this.type == tt.atId)) {
        decorator = this.value;
        this.next();
    }

    let canBeFunc = !isPrivate && !isObserved && !decorator;

    let isLegacy = false;
    if (canBeProp && this.eatContextual("legacy")) {
        isLegacy = true;
    }

    if (canBeProp && this.eatContextual("prop")) {
        let modifier = null;

        if      (isPrivate)  modifier = "private";
        else if (isReadonly) modifier = "readonly";
        else if (isObserved) modifier = "observed";

        return this.nxParseProp(node, isStatic, modifier, decorator, isLegacy);

    } else if (canBeFunc && this.eatContextual("func")) {
        return this.nxParseFunc(node, isStatic, isAsync);

    } else if (isReadonly && !isAsync && !decorator) {
        let result = super.parseClassElement(constructorAllowsSuper);
        
        if (result.type == Syntax.PropertyDefinition) {
            result.static = isStatic;
            result.readonly = isReadonly;

            return result;
        }
    }

    if (state) this.restoreState(state);
    return super.parseClassElement(constructorAllowsSuper);
}


nxParseProp(node, isStatic, modifier, decorator, isLegacy)
{
    node.static = isStatic;
    node.modifier = modifier;
    node.decorator = decorator;
    node.legacy = isLegacy;
    
    node.key = this.parseIdent(true);
    node.annotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;

    if (this.eat(tt.eq)) {
        let scope = this.currentThisScope();
        let inClassFieldInit = scope.inClassFieldInit;
        scope.inClassFieldInit = true;
        node.value = this.parseMaybeAssign();
        scope.inClassFieldInit = inClassFieldInit;
    } else {
        node.value = null;
    }

    this.semicolon();

    return this.finishNode(node, Syntax.NXPropDefinition)
}


nxParseFuncParameter()
{
    const node = this.startNode();
   
    let labelOrName = this.parseIdent(true);

    let label;
    let name;

    if (this.type == tt.question || this.type == tt.colon || this.type == tt.comma || this.type == tt.parenR) {
        label = null;
        name = labelOrName;
    } else {
        label = labelOrName;
        name = this.parseIdent(true);
    }
    
    node.label = label;
    node.name = name;

    if (this.type == tt.question) {
        node.optional = true;
        node.question = this.nxParsePunctuation();
    } else {
        node.optional = false;
        node.question = null;
    }
        
    if (this.type == tt.colon) {
        node.annotation = (this.type == tt.colon) ? this.tsParseTypeAnnotation() : null;
    } else {
        node.annotation = null;
    }
    

    return this.finishNode(node, Syntax.NXFuncParameter);
}


nxParseFunc(node, isStatic, isAsync)
{
    node.static = isStatic;
    node.async = isAsync;

    node.key = this.parseIdent(true);
    node.params = [ ];
    
    if (this.nxInInterface) {
        node.optional = this.eat(tt.question);
    }

    this.expect(tt.parenL);

    let needsComma = false;
    while (!this.eat(tt.parenR)) {
        if (needsComma) this.expect(tt.comma);
        node.params.push(this.nxParseFuncParameter());
        needsComma = true;
    }
    
    if (this.type == tt.colon) {
        node.annotation = this.tsParseTypeAnnotation();
    }

    if (this.type == tt.braceL) {
        let flags = 66; // 2(SCOPE_FUNCTION) + 64(SCOPE_SUPER)
        if (isAsync) flags += 4; // SCOPE_ASYNC

        this.enterScope(flags);

        node.body = this.parseBlock();

        this.exitScope();
    }

    return this.finishNode(node, Syntax.NXFuncDefinition);
}


parseStatement(context, topLevel, exports)
{
    if (this.isContextual("enum")) {
        return this.nxParseEnumDeclaration();
        
    } else if (this.isContextual("interface")) {
        return this.nxParseInterfaceDeclaration();

    } else if (this.isContextual("type")) {
        let result = this.nxMaybeParseTypeDefinition();
        if (result) return result;

    } else if (this.isContextual("global")) {
        let result = this.nxMaybeParseGlobalDefinition();
        if (result) return result;
    }
    
    return super.parseStatement(context, topLevel, exports);
}


}
