package com.aiphone.agent.workflow

import com.aiphone.agent.root.CommandResult
import com.aiphone.agent.vision.Match
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TapImageRunnerTest {
    private val match = Match(x = 1800, y = 200, width = 180, height = 80, confidence = 0.97)

    @Test
    fun `retries and confirms the image disappeared before returning found`() {
        val matches = mutableListOf<Match?>(match, match, null)
        val taps = mutableListOf<Pair<Int, Int>>()

        val result = TapImageRunner(
            findImage = { matches.removeAt(0) },
            tap = { x, y -> taps += x to y; CommandResult(0, byteArrayOf()) },
            delay = {},
        ).run(TapImageOptions(maxAttempts = 2, verificationDelayMs = 500))

        assertEquals("FOUND", result)
        assertEquals(listOf(1890 to 240, 1890 to 240), taps)
    }

    @Test
    fun `fails instead of reporting found when the image remains visible`() {
        val logs = mutableListOf<Pair<String, String>>()
        var tapCount = 0

        val error = assertThrows(IllegalStateException::class.java) {
            TapImageRunner(
                findImage = { match },
                tap = { _, _ -> tapCount++; CommandResult(0, byteArrayOf()) },
                delay = {},
                log = { level, message -> logs += level to message },
            ).run(TapImageOptions(maxAttempts = 2, verificationDelayMs = 500))
        }

        assertEquals(2, tapCount)
        assertTrue(error.message!!.contains("1890, 240"))
        assertTrue(logs.any { (level, message) -> level == "INFO" && message.contains("confidence=0.970") })
        assertTrue(logs.any { (level, message) -> level == "WARN" && message.contains("Ảnh vẫn còn") })
    }

    @Test
    fun `returns timeout without tapping when the image is absent`() {
        var tapCount = 0

        val result = TapImageRunner(
            findImage = { null },
            tap = { _, _ -> tapCount++; CommandResult(0, byteArrayOf()) },
            delay = {},
        ).run(TapImageOptions())

        assertEquals("TIMEOUT", result)
        assertEquals(0, tapCount)
    }

    @Test
    fun `does not retry after cancellation`() {
        var cancelled = false
        var tapCount = 0

        val result = TapImageRunner(
            findImage = { match },
            tap = { _, _ -> tapCount++; CommandResult(0, byteArrayOf()) },
            delay = { cancelled = true },
            isCancelled = { cancelled },
        ).run(TapImageOptions(maxAttempts = 2))

        assertEquals("TIMEOUT", result)
        assertEquals(1, tapCount)
    }
}
