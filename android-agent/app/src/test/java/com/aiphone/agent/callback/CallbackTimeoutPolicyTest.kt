package com.aiphone.agent.callback

import org.junit.Assert.assertEquals
import org.junit.Test

class CallbackTimeoutPolicyTest {
    @Test
    fun `visual callback commands receive longer loopback timeouts`() {
        assertEquals(25_000, callbackReadTimeoutMs("/api/device"))
        assertEquals(45_000, callbackReadTimeoutMs("/api/screenshots"))
        assertEquals(75_000, callbackReadTimeoutMs("/api/vision/ocr-screen"))
    }
}
