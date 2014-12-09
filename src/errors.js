/*
    errors.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var OJError = { };

OJError.ParseError				       = "OJParseError";
OJError.DuplicateClassDefinition       = "OJDuplicateClassDefinitionError";
OJError.DuplicatePropertyDefinition    = "OJDuplicatePropertyDefinitionError";
OJError.DuplicateMethodDefinition      = "OJDuplicateMethodDefinitionError";
OJError.DuplicateProtocolDefinition    = "OJDuplicateProtocolDefinition";
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
OJError.TypeAlreadyExists              = "OJTypeAlreadyExistsError";
OJError.CircularTypedefHierarchy       = "OJCircularTypedefHierarchyError";
OJError.CircularClassHierarchy         = "OJCircularClassHierarchyError";
OJError.VariableAlreadyDeclared        = "OJVariableAlreadyDeclaredError";
OJError.VariableNotYetDeclared         = "OJVariableNotYetDeclaredError";

var OJWarning = { };

OJWarning.UnknownSelector              = "OJUnknownSelectorWarning";
OJWarning.UseOfThisInMethod            = "OJUseOfThisInMethodWarning";
OJWarning.UnusedInstanceVariable       = "OJUnusedInstanceVariableWarning";
OJWarning.UndeclaredInstanceVariable   = "OJUndeclaredInstanceVariableWarning";



module.exports = {
    OJError:   OJError,
    OJWarning: OJWarning
};
