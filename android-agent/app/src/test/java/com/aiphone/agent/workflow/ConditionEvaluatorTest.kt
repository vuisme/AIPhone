package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Test

class ConditionEvaluatorTest {
    private val context = RunContext().apply {
        set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))
        set("rewardName", RunValue(WorkflowValueType.STRING, "Tướng hiếm"))
    }

    @Test
    fun `compares a variable with a typed literal`() {
        val result = evaluateCondition(
            context,
            ConditionSpec(
                left = ValueOperand.variable("rewardCount"),
                operator = ConditionOperator.GREATER_THAN,
                right = ValueOperand.literal(WorkflowValueType.NUMBER, 2.0),
            ),
        )

        assertEquals("TRUE", result.outcome)
    }

    @Test
    fun `supports string matching without JavaScript`() {
        val result = evaluateCondition(
            context,
            ConditionSpec(
                left = ValueOperand.variable("rewardName"),
                operator = ConditionOperator.CONTAINS,
                right = ValueOperand.literal(WorkflowValueType.STRING, "hiếm"),
            ),
        )

        assertEquals("TRUE", result.outcome)
    }
}
