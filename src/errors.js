

var OJError = { };

OJError.DuplicatePropertyDefinition    = "DuplicatePropertyDefinition";
OJError.DuplicateMethodDefinition      = "DuplicateMethodDefinition";
OJError.UndeclaredInstanceVariable     = "UndeclaredInstanceVariable";
OJError.DuplicateJavascriptFunction    = "DuplicateJavascriptFunction";
OJError.PropertyAlreadySynthesized     = "PropertyAlreadySynthesized";
OJError.PropertyAlreadyDynamic         = "PropertyAlreadyDynamic";
OJError.InstanceVariableAlreadyClaimed = "InstanceVariableAlreadyClaimed";
OJError.UseOfThisInMethod              = "UseOfThisInMethod";

module.exports = { OJError: OJError };
