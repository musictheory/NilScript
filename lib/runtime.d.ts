/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface $oj_$SEL   { }

interface $oj_$Runtime {
    _g : $oj_$Globals;
    noConflict() : $oj_$Runtime;

    getClassList() : Array<$oj_$StaticBase>;
    getSubclassesOfClass(cls : $oj_$StaticBase) : Array<$oj_$StaticBase>;
    getSuperclass(cls : $oj_$StaticBase) : $oj_$StaticBase;
    isObject(object : any) : boolean;
    sel_getName(aSelector : $oj_$SEL) : string;
    sel_isEqual(aSelector : $oj_$SEL, bSelector : $oj_$SEL) : boolean;
    class_getName(cls : $oj_$StaticBase) : string;
    class_getSuperclass(cls : $oj_$StaticBase) : $oj_$StaticBase;
    class_isSubclassOf(cls : $oj_$StaticBase, superclass : $oj_$StaticBase) : boolean;
    class_respondsToSelector(cls : $oj_$StaticBase, selector : $oj_$SEL) : boolean;
    object_getClass(object : $oj_$Base) : $oj_$StaticBase;
    msgSend(receiver : any, selector : $oj_$SEL, ...args : any[]) : any;
}

declare class $oj_MethodMap {
    [ s : string ] : Function;
}

declare class $oj_AnyMap {
    [ s : string ] : any;
}

declare class $oj_$Base {
    static alloc() : $oj_$Base;
    static superclass() : $oj_$StaticBase;
    static className() : string;
    static class() : $oj_$StaticBase;
    static respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    static instancesRespondToSelector_(aSelector : $oj_$SEL) : boolean;
    static isKindOfClass_(cls : $oj_$StaticBase) : boolean;
    static isMemberOfClass_(cls : $oj_$StaticBase) : boolean;
    static isSubclassOfClass_(cls : $oj_$StaticBase) : boolean;
    static isEqual_(other : $oj_$Base) : boolean;
        
    init() : $oj_$Base;
    copy() : any;
    superclass() : $oj_$StaticBase;
    class() : $oj_$StaticBase;
    className() : string;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    performSelector_(aSelector : $oj_$SEL) : any;
    performSelector_withObject_(aSelector : $oj_$SEL, object : any) : any;
    performSelector_withObject_withObject_(aSelector : $oj_$SEL, o1 : any, o2 : any) : any;
    description() : string;
    toString() : string;
    isKindOfClass_(cls : $oj_$StaticBase) : boolean;
    isMemberOfClass_(cls : $oj_$StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare class $oj_$StaticBase extends Function {
    alloc() : $oj_$Base;
    class() : $oj_$StaticBase;
    superclass() : $oj_$StaticBase;
    className() : string;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    instancesRespondToSelector_(aSelector : $oj_$SEL) : boolean;
    isKindOfClass_(cls : $oj_$StaticBase) : boolean;
    isMemberOfClass_(cls : $oj_$StaticBase) : boolean;
    isSubclassOfClass_(cls : $oj_$StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare var $oj_oj : $oj_$Runtime;
declare var oj     : $oj_$Runtime;

declare function $oj_$AtEachGetMember<T>(arg : T[]) : T;
declare function $oj_$AtEachGetMember(arg : any) : any;
declare function $oj_$AtEachTest() : boolean;

