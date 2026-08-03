package com.aiphone.agent.vision

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenCaptureGatewayTest {
    @Test
    fun `uses accessibility capture when root capture fails`() {
        val expected = byteArrayOf(1, 2, 3)
        val gateway = ScreenCaptureGateway(
            rootCapture = { error("root denied") },
            accessibilityCapture = { expected },
        )

        assertArrayEquals(expected, gateway.captureScreen())
    }

    @Test
    fun `keeps root capture as the preferred path`() {
        var accessibilityCalls = 0
        val expected = byteArrayOf(4, 5, 6)
        val gateway = ScreenCaptureGateway(
            rootCapture = { expected },
            accessibilityCapture = {
                accessibilityCalls += 1
                byteArrayOf(7)
            },
        )

        assertArrayEquals(expected, gateway.captureScreen())
        assertEquals(0, accessibilityCalls)
    }

    @Test
    fun `reports both capture failures`() {
        val gateway = ScreenCaptureGateway(
            rootCapture = { error("root denied") },
            accessibilityCapture = { error("accessibility disabled") },
        )

        val failure = runCatching { gateway.captureScreen() }.exceptionOrNull()

        assertTrue(failure?.message.orEmpty().contains("root denied"))
        assertTrue(failure?.message.orEmpty().contains("accessibility disabled"))
    }
}
