/*
    ScopeManager.js
    (c) 2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php


    Initial traversal (called from Builder):
    - Use enterNode() and exitNode()
    - ScopeManager will handle variable, parameter, and function declarations
    - Call define(object) with an Model.Class, Model.Enum, or Model.Type instance
    
    Post-build (called from Compiler):
    - Call finish(importMap)

    Additional traversals (called from Generator):
    - Call reset() to reset to root scope
    - Use revisitNode() and exitNode()


    Note:
    TypeScript uses two "declaration spaces" per lexical scope: a "value"  
    space and a "type" space. 
    
    - `class` and `enum` add to both spaces.
    - `type` and `interface` add to the type space.
    - variables/parameters/functions add to the value space.
    
    For more information on how TypeScript handles scopes, see Section 2.3
    of the (outdated) TypeScript Language Specification at
    https://github.com/microsoft/TypeScript/blob/v3.4.1/doc/spec.md#2.3
    
    
    
*/

import { Syntax } from "./ast/Tree.js";
import { Model  } from "./model/Model.js";

const ImportType = {
    None: 0,
    Past: 1,
    Future: 2
};


class ScopeDeclaration
{
    constructor(name, object, importType) {
        this.name = name;
        this.object = object;
        this.importType = importType;
    }
}


class Scope
{
    constructor() {
        this.children = [ ];

        this.valueDeclarations = Object.create(null);
        this.typeDeclarations  = Object.create(null);

        this.values = Object.create(null);
        this.types  = Object.create(null);
    }
}


export class ScopeManager {

static ImportType = ImportType;


constructor(nsFile, model, options)
{
    this._imports = new Map();
    this._nodeToScopeMap = new Map();
    this._rootScope = this._scope = new Scope();
    this._scopeStack = [ ];
}



_startsNewScope(node)
{
    let type = node.type;
  
    return (
        type == Syntax.FunctionDeclaration ||
        type == Syntax.FunctionExpression  ||
        type == Syntax.ArrowFunctionExpression ||
        type == Syntax.CatchClause ||
        type == Syntax.ForStatement ||
        type == Syntax.ForInStatement ||
        type == Syntax.ForOfStatement ||
        type == Syntax.SwitchStatement ||
        type == Syntax.BlockStatement
    );
}


_declareIdentifier(node)
{
    if (node.type == Syntax.Identifier) {
        let name = node.name;
        let declaration = new ScopeDeclaration(name, null, ImportType.None);
        
        this._scope.valueDeclarations[name] = declaration;
    }
}


_declareIdentifiersIn(nodes)
{
    for (let node of nodes) {
        this._declareIdentifier(node);
    }
}


_addObjectDeclaration(declaration, values, types)
{
    let { name, object } = declaration;

    if (
        object instanceof Model.Class ||
        object instanceof Model.Enum  ||
        object instanceof Model.Value
    ) {
        values[name] = declaration;
        types[name] = declaration;

    } else if (object instanceof Model.Runtime) {
        values[name] = declaration;

    } else if (object instanceof Model.Type) {
        types[name] = declaration;
    }
}


declare(object)
{
    this._addObjectDeclaration(
        new ScopeDeclaration(object.name, object, ImportType.None),
        this._scope.valueDeclarations,
        this._scope.typeDeclarations
    );
}


reset()
{
    this._scope = this._rootScope;
    this._scopeStack = [ ];
}


finish(importMap)
{
    function merge(...args) {
        return Object.assign(Object.create(null), ...args);
    }

    function visit(scope) {
        let values = scope.values;
        let types  = scope.types;

        for (let child of scope.children) {
            child.values = merge(values, child.valueDeclarations);
            child.types  = merge(types,  child.typeDeclarations);

            visit(child);
        }
    }
    
    let root = this._rootScope;
    
    let rootValues = merge(root.valueDeclarations);
    let rootTypes  = merge(root.typeDeclarations);
    
    for (let [ key, { object, importType } ] of importMap) {
        let declaration = new ScopeDeclaration(key, object, importType);
        this._imports.set(key, declaration);
        this._addObjectDeclaration(declaration, rootValues, rootTypes);
    }
    
    root.values = rootValues;
    root.types  = rootTypes;

    visit(root);
}


enterNode(node)
{
    let type = node.type;
    
    if (type == Syntax.FunctionDeclaration) {
        this._declareIdentifier(node.id);
    }
    
    if (this._startsNewScope(node)) {
        let scope = new Scope();
        this._scope.children.push(scope);
        this._nodeToScopeMap.set(node, scope);

        this._scopeStack.push(this._scope);
        this._scope = scope;
    }
    
    if (
        type == Syntax.FunctionDeclaration ||
        type == Syntax.FunctionExpression  ||
        type == Syntax.ArrowFunctionExpression
    ) {
        this._declareIdentifiersIn(node.params);

    } else if (type == Syntax.CatchClause) {
        this._declareIdentifier(node.param);

    } else if (type == Syntax.RestElement) {
        this._declareIdentifier(node.argument);

    } else if (type == Syntax.ArrayPattern) {
        this._declareIdentifiersIn(node.elements);
        
    } else if (type == Syntax.ObjectPattern) {
        for (let property of node.properties) {
            this._declareIdentifier(property.value);
        }

    } else if (type == Syntax.VariableDeclarator) {
        this._declareIdentifier(node.id);
    }
}


reenterNode(node)
{
    if (!this._startsNewScope(node)) return;

    let scope = this._nodeToScopeMap.get(node);
    if (!scope) throw new Error("No saved scope for node");
        
    this._scopeStack.push(this._scope);
    this._scope = scope;
}


exitNode(node)
{
    if (this._startsNewScope(node)) {
        this._scope = this._scopeStack.pop();
    }
}


getTopLevelDeclarations() {
    return Object.values(this._rootScope.valueDeclarations);
}


getAllValues() { return Object.values(this._scope.values); }
getAllTypes()  { return Object.values(this._scope.types);  }

getValue(name) { return this._scope.values[name]; }
getType(name)  { return this._scope.types[name];  }

getImport(name) { return this._imports.get(name); }


}
