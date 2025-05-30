/*
    TypeWorker.js
    Main implementation of type checking, wraps the TypeScript compiler
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

let ts; // Loaded dynamically


export async function generateBuiltins(options)
{
    let generator = new BuiltinGenerator(options);
    return generator.generateBuiltins();
}


export class BuiltinGenerator {


constructor(options)
{
    this._options = options;
    this._unusedInterfaces = null;
    this._builtins = null;
}


_visitNode(node)
{
    let visitChildren = true;

    if (ts.isIdentifier(node)) {
        this._builtins.add(node.escapedText);

    } else if (ts.isInterfaceDeclaration(node)) {
        let name = node.name.escapedText;
        
        for (let reOrString of this._unusedInterfaces) {
            if (name.match(reOrString)) return;
        }

    } else if (
        ts.isParameter(node) ||
        ts.isParameterDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)
    ) {
        if (node.type) this._visitNode(node.type);
        visitChildren = false;

    } else if (ts.isTypeReferenceNode(node)) {
        visitChildren = false;
    }

    if (visitChildren) {
        ts.forEachChild(node, child => this._visitNode(child));
    }
}

async generateBuiltins()
{
    if (!ts) ts = (await import("typescript")).default;

    let options = this._options;

    let target = options["typescript-target"];
    let lib    = options["typescript-lib"];
    let defs   = options["defs"];
    
    if (!defs || !defs.length) {
        defs = [ "" ];
    }

    if (lib && !Array.isArray(lib)) {
        lib = lib.split(",");
    }

    let unusedInterfaces = options["unused-interfaces"];
    this._unusedInterfaces = unusedInterfaces ?? [ ];

    this._builtins = new Set();
    
    let { options: tsOptions, errors: tsErrors } = ts.convertCompilerOptionsFromJson({ "target": target, "lib": lib });
    let program = ts.createProgram( defs, tsOptions );

    program.getSourceFiles().forEach(sourceFile => {
        this._visitNode(sourceFile);
    });

    return Array.from(this._builtins);
}

}
