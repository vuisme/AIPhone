package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NodeTestSelectionTest {
    @Test
    fun `selects exactly the requested saved node`() {
        assertEquals(1, selectSingleNodeIndex(listOf("start", "delay", "success"), "delay"))
    }

    @Test
    fun `rejects a missing or duplicated node`() {
        assertThrows(IllegalArgumentException::class.java) {
            selectSingleNodeIndex(listOf("start", "success"), "delay")
        }
        assertThrows(IllegalArgumentException::class.java) {
            selectSingleNodeIndex(listOf("start", "delay", "delay"), "delay")
        }
    }
}
