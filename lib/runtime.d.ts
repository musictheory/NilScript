/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface $ns_$SEL   { }

interface $ns_$Runtime {
    _g : $ns_$Globals;
    noConflict() : $ns_$Runtime;

    getClassList() : Array<$ns_$StaticBase>;
    getSubclassesOfClass(cls : $ns_$StaticBase) : Array<$ns_$StaticBase>;
    getSuperclass(cls : $ns_$StaticBase) : $ns_$StaticBase;
    isObject(object : any) : boolean;
    sel_getName(aSelector : $ns_$SEL) : string;
    sel_isEqual(aSelector : $ns_$SEL, bSelector : $ns_$SEL) : boolean;
    class_getName(cls : $ns_$StaticBase) : string;
    class_getSuperclass(cls : $ns_$StaticBase) : $ns_$StaticBase;
    class_isSubclassOf(cls : $ns_$StaticBase, superclass : $ns_$StaticBase) : boolean;
    class_respondsToSelector(cls : $ns_$StaticBase, selector : $ns_$SEL) : boolean;
    object_getClass(object : $ns_$Base) : $ns_$StaticBase;
    msgSend(receiver : any, selector : $ns_$SEL, ...args : any[]) : any;
}

declare class $ns_MethodMap {
    [ s : string ] : Function;
}

declare class $ns_AnyMap {
    [ s : string ] : any;
}

declare class $ns_$Base {
    static alloc() : $ns_$Base;
    static superclass() : $ns_$StaticBase;
    static className() : string;
    static class() : $ns_$StaticBase;
    static respondsToSelector_(aSelector : $ns_$SEL) : boolean;
    static instancesRespondToSelector_(aSelector : $ns_$SEL) : boolean;
    static isKindOfClass_(cls : $ns_$StaticBase) : boolean;
    static isMemberOfClass_(cls : $ns_$StaticBase) : boolean;
    static isSubclassOfClass_(cls : $ns_$StaticBase) : boolean;
    static isEqual_(other : $ns_$Base) : boolean;
        
    init() : $ns_$Base;
    copy() : any;
    superclass() : $ns_$StaticBase;
    class() : $ns_$StaticBase;
    className() : string;
    respondsToSelector_(aSelector : $ns_$SEL) : boolean;
    performSelector_(aSelector : $ns_$SEL) : any;
    performSelector_withObject_(aSelector : $ns_$SEL, object : any) : any;
    performSelector_withObject_withObject_(aSelector : $ns_$SEL, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : $ns_$StaticBase) : boolean;
    isMemberOfClass_(cls : $ns_$StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare class $ns_$StaticBase extends Function {
    alloc() : $ns_$Base;
    class() : $ns_$StaticBase;
    superclass() : $ns_$StaticBase;
    className() : string;
    respondsToSelector_(aSelector : $ns_$SEL) : boolean;
    instancesRespondToSelector_(aSelector : $ns_$SEL) : boolean;
    isKindOfClass_(cls : $ns_$StaticBase) : boolean;
    isMemberOfClass_(cls : $ns_$StaticBase) : boolean;
    isSubclassOfClass_(cls : $ns_$StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare var $ns_ns    : $ns_$Runtime;
declare var nilscript : $ns_$Runtime;

declare function $ns_$AtEachGetMember<T>(arg : T[]) : T;
declare function $ns_$AtEachGetMember(arg : any) : any;
declare function $ns_$AtEachTest() : boolean;

