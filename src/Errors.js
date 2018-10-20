/*
    Errors.js
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const NSError = {
    ParseError:                     "NilScriptParseError",
    NotYetSupported:                "NilScriptNotYetSupportedError",

// Used for mixed types (@class Foo conflicts with @enum Foo)
    DuplicateDeclaration:           "NilScriptDuplicateDeclarationError",

    DuplicateClass:                 "NilScriptDuplicateClassError",
    DuplicateEnum:                  "NilScriptDuplicateEnumError",
    DuplicateInstanceVariable:      "NilScriptDuplicateInstanceVariableError",
    DuplicateJavascriptFunction:    "NilScriptDuplicateJavascriptFunctionError",
    DuplicateMethod:                "NilScriptDuplicateMethodError",
    DuplicateProperty:              "NilScriptDuplicatePropertyError",
    DuplicateProtocol:              "NilScriptDuplicateProtocolError",
    DuplicateType:                  "NilScriptDuplicateTypeError",

    UnknownProperty:                "NilScriptUnknownPropertyError",
    UnknownPropertyAttribute:       "NilScriptUnknownPropertyAttributeError",
    PropertyAlreadySynthesized:     "NilScriptPropertyAlreadySynthesizedError",
    PropertyAlreadyDynamic:         "NilScriptPropertyAlreadyDynamicError",
    InstanceVariableAlreadyClaimed: "NilScriptInstanceVariableAlreadyClaimedError",
    NonLiteralConst:                "NilScriptNonLiteralConstError",
    NonLiteralEnum:                 "NilScriptNonLiteralEnumError",
    NonIntegerEnum:                 "NilScriptNonIntegerEnumError",
    SelfIsReserved:                 "NilScriptSelfIsReservedError",
    ReservedIdentifier:             "NilScriptReservedIdentifierError",
    ReservedMethodName:             "NilScriptReservedMethodNameError",
    SqueezerReachedEndIndex:        "NilScriptSqueezerReachedEndIndexError",
    CircularTypeHierarchy:          "NilScriptCircularTypeHierarchyError",
    VariableAlreadyDeclared:        "NilScriptVariableAlreadyDeclaredError",
    VariableNotYetDeclared:         "NilScriptVariableNotYetDeclaredError",
    RestrictedUsage:                "NilScriptRestrictedUsageError",
    APIMisuse:                      "NilScriptAPIMisuseError",
    CircularClassHierarchy:         "NilScriptCircularClassHierarchyError",
    UnknownSuperclass:              "NilScriptUnknownSuperclassError"
};


const NSWarning = {
    MissingTypeAnnotation:        "NilScriptMissingTypeAnnotationWarning",
    PropertyUsingInherited:       "NilScriptPropertyUsingInheritedWarning",
    NeedsExplicitDynamic:         "NilScriptNeedsExplicitDynamicWarning",
    OnCompileFunction:            "NilScriptOnCompileFunctionWarning",
    Typechecker:                  "NilScriptTypecheckerWarning",
    UnassignedInstanceVariable:   "NilScriptUnassignedInstanceVariableWarning",
    UndeclaredInstanceVariable:   "NilScriptUndeclaredInstanceVariableWarning",
    InheritedInstanceVariable:    "NilScriptInheritedInstanceVariableWarning",
    UnknownSelector:              "NilScriptUnknownSelectorWarning",
    UnusedInstanceVariable:       "NilScriptUnusedInstanceVariableWarning",
    UseOfDebugger:                "NilScriptUseOfDebuggerWarning",
    UseOfEmptyArrayElement:       "NilScriptUseOfEmptyArrayElementWarning",
    UseOfSelfInNonMethod:         "NilScriptUseOfSelfInNonMethodWarning",
    UseOfThisInMethod:            "NilScriptUseOfThisInMethodWarning"
};


module.exports = {
    NSError:   NSError,
    NSWarning: NSWarning
};
