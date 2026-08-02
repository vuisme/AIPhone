package com.aiphone.agent.workflow

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.util.Locale

enum class WorkflowValueType { STRING, NUMBER, BOOLEAN, JSON }

data class RunValue(val type: WorkflowValueType, val value: Any?) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("type", type.name)
        put("value", value ?: JSONObject.NULL)
    }

    fun display(): String = when (value) {
        null, JSONObject.NULL -> "null"
        is Double -> if (value % 1.0 == 0.0) value.toLong().toString() else String.format(Locale.US, "%s", value)
        is Float -> if (value % 1f == 0f) value.toLong().toString() else String.format(Locale.US, "%s", value)
        is JSONObject, is JSONArray -> value.toString()
        else -> value.toString()
    }

    companion object {
        fun fromLiteral(type: WorkflowValueType, rawValue: Any?): RunValue = RunValue(type, when (type) {
            WorkflowValueType.STRING -> if (rawValue == null || rawValue == JSONObject.NULL) "" else rawValue.toString()
            WorkflowValueType.NUMBER -> when (rawValue) {
                is Number -> rawValue.toDouble()
                else -> rawValue?.toString()?.toDoubleOrNull() ?: error("Invalid NUMBER value")
            }
            WorkflowValueType.BOOLEAN -> when (rawValue) {
                is Boolean -> rawValue
                else -> when (rawValue?.toString()?.lowercase()) {
                    "true" -> true
                    "false" -> false
                    else -> error("Invalid BOOLEAN value")
                }
            }
            WorkflowValueType.JSON -> when (rawValue) {
                null, JSONObject.NULL -> JSONObject.NULL
                is JSONObject, is JSONArray -> rawValue
                else -> JSONTokener(rawValue.toString()).nextValue()
            }
        })
    }
}

class RunContext {
    private val values = linkedMapOf<String, RunValue>()

    @Synchronized
    fun set(name: String, value: RunValue) {
        require(VARIABLE_PATTERN.matches(name)) { "Invalid variable name $name" }
        values[name] = value
    }

    @Synchronized
    fun require(name: String): RunValue = values[name] ?: error("Variable $name is not defined")

    @Synchronized
    fun snapshot(): Map<String, RunValue> = LinkedHashMap(values)

    @Synchronized
    fun toJson(): JSONObject = JSONObject().apply {
        values.forEach { (name, value) -> put(name, value.toJson()) }
    }

    fun interpolate(template: String): String = VARIABLE_TOKEN.replace(template) { match -> require(match.groupValues[1]).display() }

    companion object {
        private val VARIABLE_PATTERN = Regex("^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")
        private val VARIABLE_TOKEN = Regex("\\{\\{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\}\\}")

        fun isValidVariableName(name: String): Boolean = VARIABLE_PATTERN.matches(name)

        fun fromWorkflow(document: JSONObject): RunContext = RunContext().apply {
            val parameters = document.optJSONArray("parameters") ?: JSONArray()
            for (index in 0 until parameters.length()) {
                val parameter = parameters.getJSONObject(index)
                val type = WorkflowValueType.valueOf(parameter.optString("type", WorkflowValueType.STRING.name))
                set(parameter.getString("name"), RunValue.fromLiteral(type, parameter.opt("defaultValue")))
            }
        }
    }
}

data class NodeResult(
    val outcome: String? = null,
    val value: RunValue? = null,
    val metadata: Map<String, Any?> = emptyMap(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("outcome", outcome ?: JSONObject.NULL)
        put("value", value?.toJson() ?: JSONObject.NULL)
        put("metadata", JSONObject(metadata))
    }

    fun description(): String? = outcome?.let { "Kết quả: $it" } ?: value?.let { "Giá trị: ${it.display()}" }
}

enum class OperandKind { LITERAL, VARIABLE }

data class ValueOperand(
    val kind: OperandKind,
    val variableName: String? = null,
    val literalValue: RunValue? = null,
) {
    fun resolve(context: RunContext): RunValue = when (kind) {
        OperandKind.VARIABLE -> context.require(variableName ?: error("Variable operand requires a name"))
        OperandKind.LITERAL -> literalValue ?: error("Literal operand requires a value")
    }

    companion object {
        fun variable(name: String) = ValueOperand(OperandKind.VARIABLE, variableName = name)
        fun literal(type: WorkflowValueType, value: Any?) = ValueOperand(OperandKind.LITERAL, literalValue = RunValue.fromLiteral(type, value))
    }
}

enum class ConditionOperator {
    EQUALS, NOT_EQUALS, CONTAINS, STARTS_WITH, ENDS_WITH,
    GREATER_THAN, GREATER_OR_EQUAL, LESS_THAN, LESS_OR_EQUAL,
    IS_EMPTY, IS_NOT_EMPTY,
}

data class ConditionSpec(val left: ValueOperand, val operator: ConditionOperator, val right: ValueOperand? = null)

fun evaluateCondition(context: RunContext, spec: ConditionSpec): NodeResult {
    val left = spec.left.resolve(context)
    val right = spec.right?.resolve(context)
    val matches = when (spec.operator) {
        ConditionOperator.EQUALS -> valuesEqual(left, requireNotNull(right))
        ConditionOperator.NOT_EQUALS -> !valuesEqual(left, requireNotNull(right))
        ConditionOperator.CONTAINS -> left.display().contains(requireNotNull(right).display())
        ConditionOperator.STARTS_WITH -> left.display().startsWith(requireNotNull(right).display())
        ConditionOperator.ENDS_WITH -> left.display().endsWith(requireNotNull(right).display())
        ConditionOperator.GREATER_THAN -> number(left) > number(requireNotNull(right))
        ConditionOperator.GREATER_OR_EQUAL -> number(left) >= number(requireNotNull(right))
        ConditionOperator.LESS_THAN -> number(left) < number(requireNotNull(right))
        ConditionOperator.LESS_OR_EQUAL -> number(left) <= number(requireNotNull(right))
        ConditionOperator.IS_EMPTY -> isEmpty(left)
        ConditionOperator.IS_NOT_EMPTY -> !isEmpty(left)
    }
    return NodeResult(
        outcome = if (matches) "TRUE" else "FALSE",
        value = RunValue(WorkflowValueType.BOOLEAN, matches),
        metadata = mapOf("operator" to spec.operator.name),
    )
}

private fun valuesEqual(left: RunValue, right: RunValue): Boolean = when {
    left.type == WorkflowValueType.NUMBER && right.type == WorkflowValueType.NUMBER -> number(left) == number(right)
    left.type == WorkflowValueType.JSON || right.type == WorkflowValueType.JSON -> left.display() == right.display()
    else -> left.value == right.value
}

private fun number(value: RunValue): Double = (value.value as? Number)?.toDouble()
    ?: error("${value.type} cannot be used in a numeric comparison")

private fun isEmpty(value: RunValue): Boolean = when (val raw = value.value) {
    null, JSONObject.NULL -> true
    is String -> raw.isEmpty()
    is JSONArray -> raw.length() == 0
    is JSONObject -> raw.length() == 0
    else -> false
}
