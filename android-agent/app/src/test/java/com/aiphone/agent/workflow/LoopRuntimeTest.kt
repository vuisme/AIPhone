package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class LoopRuntimeTest {
    @Test
    fun `tracks each loop ID independently and resolves repeat target`() {
        val loops = LoopRuntime()

        assertEquals(1, loops.enter("loop-a-node", "loop-a", 2))
        assertEquals(1, loops.enter("loop-b-node", "loop-b", 3))
        assertEquals(2, loops.enter("loop-a-node", "loop-a", 2))
        assertEquals("loop-a-node", loops.repeatTarget("loop-a"))
    }

    @Test
    fun `completing a loop clears its state for a future run`() {
        val loops = LoopRuntime()
        loops.enter("loop-node", "reroll", 1)

        loops.complete("reroll")

        assertEquals(1, loops.enter("loop-node", "reroll", 1))
    }

    @Test
    fun `rejects duplicate loop IDs and per-loop iteration overflow`() {
        val loops = LoopRuntime()
        loops.enter("first-node", "reroll", 1)

        assertThrows(IllegalStateException::class.java) { loops.enter("second-node", "reroll", 1) }
        assertThrows(IllegalStateException::class.java) { loops.enter("first-node", "reroll", 1) }
    }
}
