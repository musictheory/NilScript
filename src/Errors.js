/*
    Errors.js
    (c) 2013-2016 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

const OJError = { };

OJError.ParseError                     = "OJParseError";
OJError.NotYetSupported                = "OJNotYetSupportedError";
OJError.DuplicateDeclaration           = "OJDuplicateDeclarationError";
OJError.DuplicatePropertyDefinition    = "OJDuplicatePropertyDefinitionError";
OJError.DuplicateMethodDefinition      = "OJDuplicateMethodDefinitionError";
OJError.DuplicateIvarDefinition        = "OJDuplicateIvarDefinitionError";
OJError.DuplicateEnumDefinition        = "OJDuplicateEnumDefinition";
OJError.UnknownProperty                = "OJUnknownPropertyError";
OJError.DuplicateJavascriptFunction    = "OJDuplicateJavascriptFunctionError";
OJError.PropertyAlreadySynthesized     = "OJPropertyAlreadySynthesizedError";
OJError.PropertyAlreadyDynamic         = "OJPropertyAlreadyDynamicError";
OJError.InstanceVariableAlreadyClaimed = "OJInstanceVariableAlreadyClaimedError";
OJError.NonLiteralConst                = "OJNonLiteralConstError";
OJError.NonLiteralEnum                 = "OJNonLiteralEnumError";
OJError.NonIntegerEnum                 = "OJNonIntegerEnumError";
OJError.SelfIsReserved                 = "OJSelfIsReservedError";
OJError.DollarOJIsReserved             = "OJDollarOJIsReservedError";
OJError.ReservedMethodName             = "OJReservedMethodNameError";
OJError.SqueezerReachedEndIndex        = "OJSqueezerReachedEndIndexError";
OJError.CircularTypeHierarchy          = "OJCircularTypeHierarchyError";
OJError.VariableAlreadyDeclared        = "OJVariableAlreadyDeclaredError";
OJError.VariableNotYetDeclared         = "OJVariableNotYetDeclaredError";
OJError.RestrictedUsage                = "OJRestrictedUsageError";
OJError.APIMisuse                      = "OJAPIMisuseError";

const OJWarning = { };

OJWarning.CircularClassHierarchy       = "OJCircularClassHierarchyWarning";
OJWarning.UnknownSelector              = "OJUnknownSelectorWarning";
OJWarning.UseOfThisInMethod            = "OJUseOfThisInMethodWarning";
OJWarning.UseOfSelfInNonMethod         = "OJUseOfSelfInNonMethodWarning";
OJWarning.UseOfDebugger                = "OJUseOfDebuggerWarning";
OJWarning.UseOfEmptyArrayElement       = "OJUseOfEmptyArrayElementWarning";
OJWarning.UnusedInstanceVariable       = "OJUnusedInstanceVariableWarning";
OJWarning.UnassignedInstanceVariable   = "OJUnassignedInstanceVariableWarning";
OJWarning.UndeclaredInstanceVariable   = "OJUndeclaredInstanceVariableWarning";
OJWarning.MissingTypeAnnotation        = "OJMissingTypeAnnotationWarning";
OJWarning.OnCompileFunction            = "OJOnCompileFunctionWarning";
OJWarning.Typechecker                  = "OJTypecheckerWarning";

module.exports = {
    OJError:   OJError,
    OJWarning: OJWarning
};
