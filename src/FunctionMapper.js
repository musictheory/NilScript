/*
    FunctionMapper.js
    (c) 2016-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

import { SymbolUtils } from "./SymbolUtils.js";
import { Syntax      } from "./ast/Tree.js";
import { Traverser   } from "./ast/Traverser.js";


export class FunctionMapper {

constructor(file)
{
    this._file = file;
}


map()
{
    let nsFile = this._file;

    let traverser = new Traverser(nsFile.ast);

    let currentClassName = null;
    let classNameStack = [ ];
    
    let currentContext = null;
    let contextStack = [ ];

    let currentSignature = null;
    let lineSignatureList = [ ];

    function _push(node, signature)
    {
        let line = node.loc?.start?.line ?? 0;

        contextStack.push(currentContext);
        currentContext = { node, line, signature };

        if (signature && (signature != currentSignature)) {
            lineSignatureList.push( [ line, signature ] );
            currentSignature = signature;
        }
    }

    function _pop(node)
    {
        let line = node.loc?.end?.line ?? 0;

        currentContext = contextStack.pop();

        let signature = currentContext?.signature ?? null;

        if (signature != currentSignature) {
            lineSignatureList.push([ line + 1, signature ]);
            currentSignature = signature;
        }
    }
    
    function _getNodeName(node, parent)
    {
        let name = node.id?.name;

        if (!name) {
            if (parent.type === Syntax.VariableDeclarator) {
                name = parent.id?.name;
            }
        }
        
        return name ?? null;
    }

    function handleClassNode(node, parent)
    {
        classNameStack.push(currentClassName);
        currentClassName = _getNodeName(node, parent);
    }

    function handleFunctionNode(node, parent)
    {
        let signature = _getNodeName(node, parent);
        if (!currentSignature && signature) {
            _push(node, signature);
        }
    }
    
    function handleMethodDefinition(node)
    {
        if (node.computed) return;

        let name = node.key.name;
        if (!name) return;

        if (node.kind == "get") {
            name = `[get ${name}]`;
        } else if (node.kind == "set") {
            name = `[set ${name}]`;
        }
        
        if (currentClassName && name) {
            _push(node, `${currentClassName}.${name}`);
        }
    }

    function handleNXFuncDefinition(node)
    {
        let name = node.key.name;
        
        if (node.nx_func) {
            let identifier = SymbolUtils.fromFuncIdentifier(node.nx_func);
            name = SymbolUtils.toFuncString(identifier);
        }

        if (currentClassName) {
            _push(node, `${currentClassName}.${name}`);
        }
    }

    traverser.traverse((node, parent) => {
        let type = node.type;

        try {
            if (
                type == Syntax.NXInterfaceDeclaration ||
                type == Syntax.NXTypeDeclaration
            ) {
                return Traverser.SkipNode;
            
            } else if (
                type == Syntax.ClassDeclaration ||
                type == Syntax.ClassExpression
            ) {
                handleClassNode(node, parent);

            } else if (
                type == Syntax.FunctionDeclaration ||
                type == Syntax.FunctionExpression  ||
                type == Syntax.ArrowFunctionExpression
            ) {
                handleFunctionNode(node, parent);

            } else if (type == Syntax.MethodDefinition) {
                handleMethodDefinition(node);

            } else if (type == Syntax.NXFuncDefinition) {
                handleNXFuncDefinition(node);
            }

        } catch (e) {
            throw e;
        }

    }, node => {
        if (node == currentContext?.node) {
            _pop(node);
        }
    });

    return lineSignatureList;
}

}
