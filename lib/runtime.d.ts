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
    init() : N$_BaseClass;
    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    toString() : string;
}

declare class N$_BaseClass implements N$_BaseProtocol {
    static alloc() : N$_BaseClass;
    static superclass() : typeof N$_BaseClass;
    static className() : string;
    static class() : typeof N$_BaseClass;
    static respondsToSelector_(aSelector : N$_Selector) : boolean;

    init() : N$_BaseClass;
    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    toString() : string;
}

declare var N$$_      : N$_Runtime;
declare var nilscript : N$_Runtime;

declare function N$_atEachGetMember<T>(arg : T[]) : T;
declare function N$_atEachGetMember(arg : any) : any;
declare function N$_atEachTest() : boolean;

