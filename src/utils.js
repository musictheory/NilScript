/*
    utils.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

function isJScriptReservedWord(id)
{
    switch (id.length) {
    case 2:  return (id === 'if')       || (id === 'in')       || (id === 'do');
    case 3:  return (id === 'var')      || (id === 'for')      || (id === 'new')    ||
                    (id === 'try')      || (id === 'let');
    case 4:  return (id === 'this')     || (id === 'else')     || (id === 'case')   ||
                    (id === 'void')     || (id === 'with')     || (id === 'enum');
    case 5:  return (id === 'while')    || (id === 'break')    || (id === 'catch')  ||
                    (id === 'throw')    || (id === 'const')    || (id === 'yield')  ||
                    (id === 'class')    || (id === 'super');
    case 6:  return (id === 'return')   || (id === 'typeof')   || (id === 'delete') ||
                    (id === 'switch')   || (id === 'export')   || (id === 'import');
    case 7:  return (id === 'default')  || (id === 'finally')  || (id === 'extends');
    case 8:  return (id === 'function') || (id === 'continue') || (id === 'debugger');
    case 10: return (id === 'instanceof');
    default:
        return false;
    }
}


var sRuntimeDefinedMethods = {
    "alloc": 1,
    "class": 1,
    "className": 1,
    "copy": 1,
    "description": 1,
    "init": 1,
    "initialize": 1,
    "instancesRespondToSelector_": 1,
    "isEqual_": 1,
    "isKindOfClass_": 1,
    "isMemberOfClass_": 1,
    "isSubclassOfClass_": 1,
    "load": 1,
    "performSelector_": 1,
    "performSelector_withObject_": 1,
    "performSelector_withObject_withObject_": 1,
    "respondsToSelector_": 1,
    "superclass": 1,
    "toString": 1
};


var sRuntimeReservedSelectors = {
    "alloc": 1,
    "class": 1,
    "className": 1,
    "instancesRespondToSelector:": 1,
    "respondsToSelector:": 1,
    "superclass": 1,
    "isSubclassOfClass:": 1,
    "isKindOfClass:": 1,
    "isMemberOfClass:": 1
};


function isReservedSelectorName(name)
{
    return !!sRuntimeReservedSelectors[name];
}


function isRuntimeDefinedMethod(name)
{
    return !!sRuntimeDefinedMethods[name];
}


function isRuntimeDefinedClass(name)
{
    return name == "BaseObject";
}


module.exports = {
    isJScriptReservedWord:  isJScriptReservedWord,
    isReservedSelectorName: isReservedSelectorName,
    isRuntimeDefinedMethod: isRuntimeDefinedMethod,
    isRuntimeDefinedClass:  isRuntimeDefinedClass
};
