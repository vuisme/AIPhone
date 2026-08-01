package com.aiphone.agent.workflow

import com.aiphone.agent.accessibility.UiClickResult
import com.aiphone.agent.root.CommandResult
import org.junit.Assert.assertEquals
import org.junit.Test

class TapTextRunnerTest {
    @Test
    fun `uses semantic accessibility click when available`() {
        var coordinateTaps = 0

        val result = TapTextRunner(
            click = { UiClickResult(found = true, actionClicked = true, description = "Đ.KÝ SAU") },
            tap = { _, _ -> coordinateTaps++; CommandResult(0, byteArrayOf()) },
            delay = {},
        ).run(timeoutMs = 1000, pollIntervalMs = 100)

        assertEquals("FOUND", result)
        assertEquals(0, coordinateTaps)
    }

    @Test
    fun `falls back to node bounds when accessibility action is unavailable`() {
        val taps = mutableListOf<Pair<Int, Int>>()

        val result = TapTextRunner(
            click = { UiClickResult(found = true, centerX = 1890, centerY = 280, description = "Đ.KÝ SAU") },
            tap = { x, y -> taps += x to y; CommandResult(0, byteArrayOf()) },
            delay = {},
        ).run(timeoutMs = 1000, pollIntervalMs = 100)

        assertEquals("FOUND", result)
        assertEquals(listOf(1890 to 280), taps)
    }
}
