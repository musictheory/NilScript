/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface $oj_$SEL   { }

interface $oj_$Runtime {
    noConflict() : $oj_$Runtime;

    getClassList() : Array<any>;
    getSubclassesOfClass(cls) : Array<any>;
    getSuperclass(cls);
    isObject(object) : boolean;
    sel_getName(aSelector : $oj_$SEL) : String;
    sel_isEqual(aSelector : $oj_$SEL, bSelector : $oj_$SEL) : boolean;
    class_getName(cls : $oj_BaseObject$Static) : String;
    class_getSuperclass(cls : $oj_BaseObject$Static) : $oj_BaseObject$Static;
    class_isSubclassOf(cls : $oj_BaseObject$Static, superclass : $oj_BaseObject$Static) : boolean;
    class_respondsToSelector(cls : $oj_BaseObject$Static, selector : $oj_$SEL) : boolean;
    object_getClass(object) : $oj_BaseObject$Static;
    msgSend(receiver : any, selector : $oj_$SEL, ...args) : any;
    msgSend_debug(receiver : any, selector : $oj_$SEL, ...args) : any;
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


declare class $oj_BaseObject {
    static alloc() : $oj_BaseObject;
    static superclass() : $oj_BaseObject$Static;
    static className() : String;
    static class() : $oj_BaseObject$Static;
    static respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    static instancesRespondToSelector_(aSelector : $oj_$SEL) : boolean;
    static isKindOfClass_(cls) : boolean;
    static isMemberOfClass_(cls) : boolean;
    static isSubclassOfClass_(cls) : boolean;
    static isEqual_(other) : boolean;
        
    init() : $oj_BaseObject;
    copy() : any;
    superclass() : $oj_BaseObject$Static;
    class() : $oj_BaseObject$Static;
    className() : String;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    performSelector_(aSelector : $oj_$SEL);
    performSelector_withObject_(aSelector : $oj_$SEL, object);
    performSelector_withObject_withObject_(aSelector : $oj_$SEL, o1, o2);
    description() : String;
    toString() : String;
    isKindOfClass_(cls) : boolean;
    isMemberOfClass_(cls) : boolean;
    isEqual_(other) : boolean;
}

declare class $oj_BaseObject$Static extends $oj_$Constructor {
    alloc() : $oj_BaseObject;
    class() : $oj_BaseObject$Static;
    superclass() : $oj_BaseObject$Static;
    className() : String;
    respondsToSelector_(aSelector : $oj_$SEL) : boolean;
    instancesRespondToSelector_(aSelector : $oj_$SEL) : boolean;
    isKindOfClass_(cls) : boolean;
    isMemberOfClass_(cls) : boolean;
    isSubclassOfClass_(cls) : boolean;
    isEqual_(other : any) : boolean;
}

declare var $oj_oj : $oj_$Runtime;
declare var oj     : $oj_$Runtime;

declare function $oj_$EnsureArray(arg : any[]);
