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

    getClassList() : Array<typeof N$_BaseClass>;
    getSubclassesOfClass(cls : typeof N$_BaseClass) : Array<typeof N$_BaseClass>;
    getSuperclass(cls : typeof N$_BaseClass) : typeof N$_BaseClass;
    isObject(object : any) : boolean;
    sel_getName(aSelector : N$_Selector) : string;
    sel_isEqual(aSelector : N$_Selector, bSelector : N$_Selector) : boolean;
    class_getName(cls : typeof N$_BaseClass) : string;
    class_getSuperclass(cls : typeof N$_BaseClass) : typeof N$_BaseClass;
    class_isSubclassOf(cls : typeof N$_BaseClass, superclass : typeof N$_BaseClass) : boolean;
    class_respondsToSelector(cls : typeof N$_BaseClass, selector : N$_Selector) : boolean;
    object_getClass(object : N$_BaseClass) : typeof N$_BaseClass;
    msgSend(receiver : any, selector : N$_Selector, ...args : any[]) : any;
}

declare interface N$_BaseProtocol {
    init() : N$_BaseClass;
    copy() : any;
    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    performSelector_(aSelector : N$_Selector) : any;
    performSelector_withObject_(aSelector : N$_Selector, object : any) : any;
    performSelector_withObject_withObject_(aSelector : N$_Selector, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : typeof N$_BaseClass) : boolean;
    isMemberOfClass_(cls : typeof N$_BaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare class N$_BaseClass implements N$_BaseProtocol {
    static alloc() : N$_BaseClass;
    static superclass() : typeof N$_BaseClass;
    static className() : string;
    static class() : typeof N$_BaseClass;
    static respondsToSelector_(aSelector : N$_Selector) : boolean;
    static instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    static isSubclassOfClass_(cls : typeof N$_BaseClass) : boolean;

    init() : N$_BaseClass;
    copy() : any;
    superclass() : typeof N$_BaseClass;
    class() : typeof N$_BaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    performSelector_(aSelector : N$_Selector) : any;
    performSelector_withObject_(aSelector : N$_Selector, object : any) : any;
    performSelector_withObject_withObject_(aSelector : N$_Selector, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : typeof N$_BaseClass) : boolean;
    isMemberOfClass_(cls : typeof N$_BaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare var N$$_      : N$_Runtime;
declare var nilscript : N$_Runtime;

declare function N$_atEachGetMember<T>(arg : T[]) : T;
declare function N$_atEachGetMember(arg : any) : any;
declare function N$_atEachTest() : boolean;

