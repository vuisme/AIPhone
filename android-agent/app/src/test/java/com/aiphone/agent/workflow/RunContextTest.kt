package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RunContextTest {
    @Test
    fun `stores typed values and exposes them as run data`() {
        val context = RunContext()

        context.set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))
        context.set("accountReady", RunValue(WorkflowValueType.BOOLEAN, false))

        assertEquals(3.0, context.require("rewardCount").value)
        assertFalse(context.toJson().getJSONObject("accountReady").getBoolean("value"))
    }

    @Test
    fun `interpolates variables for log messages`() {
        val context = RunContext()
        context.set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))

        assertEquals("Đã nhận 3 phần quà", context.interpolate("Đã nhận {{rewardCount}} phần quà"))
    }
}
