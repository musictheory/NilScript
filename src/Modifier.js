/*
    Modifier.js
    (c) 2024 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

export class Modifier {

constructor(content)
{
    this._content = content;
    this._mods = [ ];
}


// replace(startIndex: number, endIndex: number, text: string): void
// replace(node: Node, text: string): void
replace(a, b, c)
{
    let m = Number.isInteger(a) ?
        { start: a,       end: b,     text: c ?? "" } :
        { start: a.start, end: a.end, text: b ?? "" };

    this._mods.push(m);
}


remove(a, b)
{
    this.replace(a, b);
}


insert(index, text)
{
    this.replace(index, index, text);
}


finish()
{
    let mods = this._mods;

    mods.sort(function(a, b) {
        if (a.start == b.start) {
            return a.end - b.end;
        }
        return a.start - b.start;
    });
    
    let input = this._content;
    let output = [ ];

    let index = 0;

    for (let { start, end, text } of mods) {
        if (start > index) {
            output.push(input.slice(index, start));
        }

        output.push(text);
        
        if (start != end) {
            for (let match of input.slice(start, end).matchAll("\n")) {
                output.push("\n");
            }
        }

        index = end;    
    }

    output.push(input.slice(index));
   
    return output.join("");
}


};
