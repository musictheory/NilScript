/*
    Errors.js
    (c) 2013-2023 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

export class CompilerIssue extends Error {

constructor(message, arg)
{
    super(message);
    
    if (arg) {
        if (Number.isInteger(arg)) {
            this.line = arg;

        } else if (typeof arg == "string") {
            this.line = parseInt(arg, 10);

        } else if (arg.loc?.start) {
            this.line   = arg.loc?.start?.line;
            this.column = arg.loc?.start?.col;

        } else if (Number.isInteger(arg.line)) {
            this.line   = arg.line;
            this.column = arg.column;
        }
    }
}

addFile(file)
{
    if (!this.file) {
        this.file = file;
    }
}

}
