/*
    errors.js
    (c) 2013-2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

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
