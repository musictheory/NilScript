/*
    runtime.d.ts, TypeScript declaration file for runtime.js
    by musictheory.net, LLC.

    Public Domain.
*/


interface $oj_Class { }
interface $oj_SEL   { }

interface $oj_Runtime {
    noConflict() : $oj_Runtime;

    getClassList() : Array<any>;
    getSubclassesOfClass(cls) : Array<any>;
    getSuperclass(cls);
    isObject(object) : boolean;
    sel_getName(aSelector : $oj_SEL) : String;
    sel_isEqual(aSelector : $oj_SEL, bSelector : $oj_SEL) : boolean;
    class_getName(cls : $oj_Class) : String;
    class_getSuperclass(cls : $oj_Class) : $oj_Class;
    class_isSubclassOf(cls : $oj_Class, superclass : $oj_Class) : boolean;
    class_respondsToSelector(cls : $oj_Class, selector : $oj_SEL) : boolean;
    object_getClass(object) : $oj_Class;
    msgSend(receiver : any, selector : $oj_SEL, ...args) : any;
    msgSend_debug(receiver : any, selector : $oj_SEL, ...args) : any;
}

declare class $oj_BaseObject {
    static alloc() : $oj_BaseObject;
    static superclass() : $oj_Class;
    static className() : String;
    static respondsToSelector_(aSelector : $oj_SEL) : boolean;
    static instancesRespondToSelector_(aSelector : $oj_SEL) : boolean;
    static isKindOfClass_(cls) : boolean;
    static isMemberOfClass_(cls) : boolean;
    static isSubclassOfClass_(cls) : boolean;
    static isEqual_(other) : boolean;
        
    init() : $oj_BaseObject;
    copy() : any;
    superclass();
    class();
    className() : String;
    respondsToSelector_(aSelector : $oj_SEL) : boolean;
    performSelector_(aSelector : $oj_SEL);
    performSelector_withObject_(aSelector : $oj_SEL, object);
    performSelector_withObject_withObject_(aSelector : $oj_SEL, o1, o2);
    description() : String;
    toString() : String;
    isKindOfClass_(cls) : boolean;
    isMemberOfClass_(cls) : boolean;
    isEqual_(other) : boolean;
}

declare class $oj_BaseObject$Static implements $oj_Class {
    alloc() : $oj_BaseObject;
    superclass() : $oj_Class;
    className() : String;
    respondsToSelector_(aSelector : $oj_SEL) : boolean;
    instancesRespondToSelector_(aSelector : $oj_SEL) : boolean;
    isKindOfClass_(cls) : boolean;
    isMemberOfClass_(cls) : boolean;
    isSubclassOfClass_(cls) : boolean;
    isEqual_(other : any) : boolean;
}

declare var $oj_oj : $oj_Runtime;
declare var oj     : $oj_Runtime;

