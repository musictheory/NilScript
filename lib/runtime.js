/*
    runtime.js, runtime for the Nyx language
    by musictheory.net, LLC.

    Public Domain.

*/

(function() { "use strict";

const noInitSymbol    = Symbol();
const namedInitSymbol = Symbol();

function handleInit(instance, symbol, initMethod, ...args)
{
    if (symbol === noInitSymbol) {
        return;
    } else if (symbol === namedInitSymbol) {
        instance[initMethod](...args);
    } else if (arguments.length == 1) {
        instance.init?.();
    }
}

const _ = globalThis[Symbol.for("__N$$__")] = {
    $: { },
    g: { },
    r: function() { _.$ = { }; _.g = { }; },

    i: handleInit,
    m: noInitSymbol,
    n: namedInitSymbol
};

})();
