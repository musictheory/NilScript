/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


declare function handleInit(instance: any, symbol: symbol, initMethod: any, ...args: any);

interface N$R_Runtime {
    g : N$G_Globals;

    i: handleInit,
    m: symbol,
    n: symbol
}

declare var N$$_: N$R_Runtime;
