/*
    Errors.js
    (c) 2013-2018 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const NSError = { };

NSError.ParseError                     = "NilScriptParseError";
NSError.NotYetSupported                = "NilScriptNotYetSupportedError";
NSError.DuplicateDeclaration           = "NilScriptDuplicateDeclarationError";
NSError.DuplicatePropertyDefinition    = "NilScriptDuplicatePropertyDefinitionError";
NSError.DuplicateMethodDefinition      = "NilScriptDuplicateMethodDefinitionError";
NSError.DuplicateIvarDefinition        = "NilScriptDuplicateIvarDefinitionError";
NSError.DuplicateEnumDefinition        = "NilScriptDuplicateEnumDefinition";
NSError.UnknownProperty                = "NilScriptUnknownPropertyError";
NSError.DuplicateJavascriptFunction    = "NilScriptDuplicateJavascriptFunctionError";
NSError.PropertyAlreadySynthesized     = "NilScriptPropertyAlreadySynthesizedError";
NSError.PropertyAlreadyDynamic         = "NilScriptPropertyAlreadyDynamicError";
NSError.InstanceVariableAlreadyClaimed = "NilScriptInstanceVariableAlreadyClaimedError";
NSError.NonLiteralConst                = "NilScriptNonLiteralConstError";
NSError.NonLiteralEnum                 = "NilScriptNonLiteralEnumError";
NSError.NonIntegerEnum                 = "NilScriptNonIntegerEnumError";
NSError.SelfIsReserved                 = "NilScriptSelfIsReservedError";
NSError.DollarNSIsReserved             = "NilScriptDollarNSIsReservedError";
NSError.ReservedMethodName             = "NilScriptReservedMethodNameError";
NSError.SqueezerReachedEndIndex        = "NilScriptSqueezerReachedEndIndexError";
NSError.CircularTypeHierarchy          = "NilScriptCircularTypeHierarchyError";
NSError.VariableAlreadyDeclared        = "NilScriptVariableAlreadyDeclaredError";
NSError.VariableNotYetDeclared         = "NilScriptVariableNotYetDeclaredError";
NSError.RestrictedUsage                = "NilScriptRestrictedUsageError";
NSError.APIMisuse                      = "NilScriptAPIMisuseError";

const NSWarning = { };

NSWarning.CircularClassHierarchy       = "NilScriptCircularClassHierarchyWarning";
NSWarning.UnknownSuperclass            = "NilScriptUnknownSuperclassWarning";
NSWarning.UnknownSelector              = "NilScriptUnknownSelectorWarning";
NSWarning.UseOfThisInMethod            = "NilScriptUseOfThisInMethodWarning";
NSWarning.UseOfSelfInNonMethod         = "NilScriptUseOfSelfInNonMethodWarning";
NSWarning.UseOfDebugger                = "NilScriptUseOfDebuggerWarning";
NSWarning.UseOfEmptyArrayElement       = "NilScriptUseOfEmptyArrayElementWarning";
NSWarning.UnusedInstanceVariable       = "NilScriptUnusedInstanceVariableWarning";
NSWarning.UnassignedInstanceVariable   = "NilScriptUnassignedInstanceVariableWarning";
NSWarning.UndeclaredInstanceVariable   = "NilScriptUndeclaredInstanceVariableWarning";
NSWarning.MissingTypeAnnotation        = "NilScriptMissingTypeAnnotationWarning";
NSWarning.OnCompileFunction            = "NilScriptOnCompileFunctionWarning";
NSWarning.Typechecker                  = "NilScriptTypecheckerWarning";

module.exports = {
    NSError:   NSError,
    NSWarning: NSWarning
};
