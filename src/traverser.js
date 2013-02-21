
var Traverser = (function() {

function Traverser(ast)
{
    this._ast = ast;
    this._nodes = [ ];
    this._skip = false;
}


Traverser.prototype._traverse = function(node, pre, post)
{
    var replacement = node;

    this._nodes.push(node);

    var result = pre(this);

    if (this._skip) {
        this._skip = false;
        return null;
    }

    if (result === null || result) {
        replacement = result;
    }

    var keys = Object.keys(node);
    for (var i = 0, length = keys.length; i < length; i++) {
        var child = node[keys[i]];
        if (child && typeof child === "object") {
            var newChild = !child.skip && this._traverse(child, pre, post);
            if (newChild != child) {
                if (newChild) {
                    node[keys[i]] = newChild;
                } else {
                    delete(node[keys[i]]);
                }
            }
        }
    }

    if (post) post(this);

    this._nodes.pop();

    return replacement;
}


Traverser.prototype.traverse = function(pre, post)
{
    this._ast = this._traverse(this._ast, pre, post);
}


Traverser.prototype.skip = function()
{
    this._skip = true;
}


Traverser.prototype.getPath = function()
{
    return this._nodes.slice(0);
}


Traverser.prototype.getNode = function()
{
    return this._nodes[this._nodes.length - 1];
}


Traverser.prototype.getAST = function()
{
    return this._ast;
}

return Traverser;

})();


module.exports = {
    Traverser: Traverser
};
