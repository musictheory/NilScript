/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface N$_Selector   { }

interface N$_Runtime {
    _g : N$_Globals;
    noConflict() : N$_Runtime;

    getClassList() : Array<N$_StaticBase>;
    getSubclassesOfClass(cls : N$_StaticBase) : Array<N$_StaticBase>;
    getSuperclass(cls : N$_StaticBase) : N$_StaticBase;
    isObject(object : any) : boolean;
    sel_getName(aSelector : N$_Selector) : string;
    sel_isEqual(aSelector : N$_Selector, bSelector : N$_Selector) : boolean;
    class_getName(cls : N$_StaticBase) : string;
    class_getSuperclass(cls : N$_StaticBase) : N$_StaticBase;
    class_isSubclassOf(cls : N$_StaticBase, superclass : N$_StaticBase) : boolean;
    class_respondsToSelector(cls : N$_StaticBase, selector : N$_Selector) : boolean;
    object_getClass(object : N$_Base) : N$_StaticBase;
    msgSend(receiver : any, selector : N$_Selector, ...args : any[]) : any;
}

declare class N$_Base {
    static alloc() : N$_Base;
    static superclass() : N$_StaticBase;
    static className() : string;
    static class() : N$_StaticBase;
    static respondsToSelector_(aSelector : N$_Selector) : boolean;
    static instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    static isKindOfClass_(cls : N$_StaticBase) : boolean;
    static isMemberOfClass_(cls : N$_StaticBase) : boolean;
    static isSubclassOfClass_(cls : N$_StaticBase) : boolean;
    static isEqual_(other : N$_Base) : boolean;
        
    init() : N$_Base;
    copy() : any;
    superclass() : N$_StaticBase;
    class() : N$_StaticBase;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    performSelector_(aSelector : N$_Selector) : any;
    performSelector_withObject_(aSelector : N$_Selector, object : any) : any;
    performSelector_withObject_withObject_(aSelector : N$_Selector, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : N$_StaticBase) : boolean;
    isMemberOfClass_(cls : N$_StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare class N$_StaticBase extends Function {
    alloc() : N$_Base;
    class() : N$_StaticBase;
    superclass() : N$_StaticBase;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    isKindOfClass_(cls : N$_StaticBase) : boolean;
    isMemberOfClass_(cls : N$_StaticBase) : boolean;
    isSubclassOfClass_(cls : N$_StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare var N$_nilscript : N$_Runtime;
declare var nilscript    : N$_Runtime;

declare function N$_atEachGetMember<T>(arg : T[]) : T;
declare function N$_atEachGetMember(arg : any) : any;
declare function N$_atEachTest() : boolean;

