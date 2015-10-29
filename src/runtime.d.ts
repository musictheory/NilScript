/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface $oj_$SEL   { }

interface $oj_$Runtime {
    noConflict() : $oj_$Runtime;

    getClassList() : Array<$oj_$StaticBase>;
    getSubclassesOfClass(cls : $oj_$StaticBase) : Array<$oj_$StaticBase>;
    getSuperclass(cls : $oj_$StaticBase) : $oj_$StaticBase;
    isObject(object : any) : boolean;
    sel_getName(aSelector : $oj_$SEL) : String;
    sel_isEqual(aSelector : $oj_$SEL, bSelector : $oj_$SEL) : boolean;
    class_getName(cls : $oj_$StaticBase) : String;
    class_getSuperclass(cls : $oj_$StaticBase) : $oj_$StaticBase;
    class_isSubclassOf(cls : $oj_$StaticBase, superclass : $oj_$StaticBase) : boolean;
    class_respondsToSelector(cls : $oj_$StaticBase, selector : $oj_$SEL) : boolean;
    object_getClass(object : $oj_$Base) : $oj_$StaticBase;
    msgSend(receiver : any, selector : $oj_$SEL, ...args : any[]) : any;
    msgSend_debug(receiver : any, selector : $oj_$SEL, ...args : any[]) : any;
}


// This allows [Foo class] to be used on the right-hand side of instanceof
declare class $oj_$Constructor implements Function {
    apply(thisArg: any, argArray?: any): any;
    call(thisArg: any, ...argArray: any[]): any;
    bind(thisArg: any, ...argArray: any[]): any;
    prototype: any;
    length: number;
    arguments: any;
    caller: Function;
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
    static className() : String;
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
    className() : String;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    performSelector_(aSelector : $oj_$SEL) : any;
    performSelector_withObject_(aSelector : $oj_$SEL, object : any) : any;
    performSelector_withObject_withObject_(aSelector : $oj_$SEL, o1 : any, o2 : any) : any;
    description() : String;
    toString() : String;
    isKindOfClass_(cls : $oj_$StaticBase) : boolean;
    isMemberOfClass_(cls : $oj_$StaticBase) : boolean;
    isEqual_(other : $oj_$Base) : boolean;
}

declare class $oj_$StaticBase extends $oj_$Constructor {
    alloc() : $oj_$Base;
    class() : $oj_$StaticBase;
    superclass() : $oj_$StaticBase;
    className() : String;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    instancesRespondToSelector_(aSelector : $oj_$SEL) : boolean;
    isKindOfClass_(cls : $oj_$StaticBase) : boolean;
    isMemberOfClass_(cls : $oj_$StaticBase) : boolean;
    isSubclassOfClass_(cls : $oj_$StaticBase) : boolean;
    isEqual_(other : any) : boolean;
}

declare var $oj_oj : $oj_$Runtime;
declare var oj     : $oj_$Runtime;

declare function $oj_$EnsureArray(arg : any[]) : void;
