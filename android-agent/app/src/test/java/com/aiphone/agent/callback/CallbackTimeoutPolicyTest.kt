package com.aiphone.agent.callback

import org.junit.Assert.assertEquals
import org.junit.Test

class CallbackTimeoutPolicyTest {
    @Test
    fun `visual callback commands receive longer loopback timeouts`() {
        assertEquals(25_000, callbackReadTimeoutMs("/api/device"))
        assertEquals(45_000, callbackReadTimeoutMs("/api/screenshots"))
        assertEquals(45_000, callbackReadTimeoutMs("/api/captures"))
        assertEquals(45_000, callbackReadTimeoutMs("/api/captures/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8/crop"))
        assertEquals(75_000, callbackReadTimeoutMs("/api/vision/ocr-screen"))
    }
}
