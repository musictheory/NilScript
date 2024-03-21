/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


type N$_Selector = {
    N$_Selector: string
};

interface N$_Runtime {
    _g : N$_Globals;
    noConflict() : N$_Runtime;
    isObject(object : any) : boolean;
}

declare interface N$_BaseProtocol {
    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    toString() : string;
}

declare class N$_BaseClass implements N$_BaseProtocol {
    static superclass() : typeof N$_BaseClass;
    static className() : string;
    static class() : typeof N$_BaseClass;
    static respondsToSelector_(aSelector : N$_Selector) : boolean;

    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    toString() : string;
}

declare var N$$_      : N$_Runtime;
declare var nilscript : N$_Runtime;

