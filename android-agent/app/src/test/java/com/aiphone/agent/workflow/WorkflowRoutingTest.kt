package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Test

class WorkflowRoutingTest {
    private val routes = listOf(
        WorkflowEdgeRoute("condition", "found", "FOUND"),
        WorkflowEdgeRoute("condition", "retry", "TIMEOUT"),
    )

    @Test
    fun `normal execution follows the matching outcome`() {
        assertEquals("retry", selectNextRoute(routes, "condition", "TIMEOUT", disabled = false).target)
    }

    @Test
    fun `disabled execution skips through the first saved outgoing route`() {
        assertEquals("found", selectNextRoute(routes, "condition", outcome = null, disabled = true).target)
    }
}
