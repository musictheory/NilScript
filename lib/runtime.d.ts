/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface N$_Selector   { }

interface N$_Runtime {
    _g : N$_Globals;
    noConflict() : N$_Runtime;

    getClassList() : Array<N$_StaticBaseClass>;
    getSubclassesOfClass(cls : N$_StaticBaseClass) : Array<N$_StaticBaseClass>;
    getSuperclass(cls : N$_StaticBaseClass) : N$_StaticBaseClass;
    isObject(object : any) : boolean;
    sel_getName(aSelector : N$_Selector) : string;
    sel_isEqual(aSelector : N$_Selector, bSelector : N$_Selector) : boolean;
    class_getName(cls : N$_StaticBaseClass) : string;
    class_getSuperclass(cls : N$_StaticBaseClass) : N$_StaticBaseClass;
    class_isSubclassOf(cls : N$_StaticBaseClass, superclass : N$_StaticBaseClass) : boolean;
    class_respondsToSelector(cls : N$_StaticBaseClass, selector : N$_Selector) : boolean;
    object_getClass(object : N$_BaseClass) : N$_StaticBaseClass;
    msgSend(receiver : any, selector : N$_Selector, ...args : any[]) : any;
}

declare interface N$_BaseProtocol {
    init() : N$_BaseClass;
    copy() : any;
    superclass() : N$_StaticBaseClass;
    class() : N$_StaticBaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    performSelector_(aSelector : N$_Selector) : any;
    performSelector_withObject_(aSelector : N$_Selector, object : any) : any;
    performSelector_withObject_withObject_(aSelector : N$_Selector, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : N$_StaticBaseClass) : boolean;
    isMemberOfClass_(cls : N$_StaticBaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare class N$_BaseClass implements N$_BaseProtocol {
    static alloc() : N$_BaseClass;
    static superclass() : N$_StaticBaseClass;
    static className() : string;
    static class() : N$_StaticBaseClass;
    static respondsToSelector_(aSelector : N$_Selector) : boolean;
    static instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    static isKindOfClass_(cls : N$_StaticBaseClass) : boolean;
    static isMemberOfClass_(cls : N$_StaticBaseClass) : boolean;
    static isSubclassOfClass_(cls : N$_StaticBaseClass) : boolean;
    static isEqual_(other : N$_BaseClass) : boolean;

    init() : N$_BaseClass;
    copy() : any;
    superclass() : N$_StaticBaseClass;
    class() : N$_StaticBaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    performSelector_(aSelector : N$_Selector) : any;
    performSelector_withObject_(aSelector : N$_Selector, object : any) : any;
    performSelector_withObject_withObject_(aSelector : N$_Selector, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : N$_StaticBaseClass) : boolean;
    isMemberOfClass_(cls : N$_StaticBaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare interface N$_StaticBaseProtocol {
    alloc() : N$_BaseClass;
    class() : N$_StaticBaseClass;
    superclass() : N$_StaticBaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    isKindOfClass_(cls : N$_StaticBaseClass) : boolean;
    isMemberOfClass_(cls : N$_StaticBaseClass) : boolean;
    isSubclassOfClass_(cls : N$_StaticBaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare class N$_StaticBaseClass extends Function implements N$_StaticBaseProtocol {
    alloc() : N$_BaseClass;
    class() : N$_StaticBaseClass;
    superclass() : N$_StaticBaseClass;
    className() : string;
    respondsToSelector_(aSelector : N$_Selector) : boolean;
    instancesRespondToSelector_(aSelector : N$_Selector) : boolean;
    isKindOfClass_(cls : N$_StaticBaseClass) : boolean;
    isMemberOfClass_(cls : N$_StaticBaseClass) : boolean;
    isSubclassOfClass_(cls : N$_StaticBaseClass) : boolean;
    isEqual_(other : any) : boolean;
}

declare var N$_nilscript : N$_Runtime;
declare var nilscript    : N$_Runtime;

declare function N$_atEachGetMember<T>(arg : T[]) : T;
declare function N$_atEachGetMember(arg : any) : any;
declare function N$_atEachTest() : boolean;

