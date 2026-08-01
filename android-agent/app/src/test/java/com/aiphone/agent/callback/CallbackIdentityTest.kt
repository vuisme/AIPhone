package com.aiphone.agent.callback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallbackIdentityTest {
    @Test
    fun `callback identity uses stable-sized random credentials`() {
        val first = CallbackIdentity.create()
        val second = CallbackIdentity.create()

        assertTrue(first.deviceId.startsWith("device-"))
        assertTrue(first.deviceSecret.length >= 43)
        assertEquals(10, first.pairingCode.length)
        assertNotEquals(first.deviceSecret, second.deviceSecret)
        assertFalse(first.pairingCodeHash().contains(first.pairingCode))
    }

    @Test
    fun `callback endpoint upgrades HTTPS to the versioned WSS path`() {
        assertEquals("wss://studio.example.com/callback/v1/connect", CallbackEndpoint.websocketUrl("https://studio.example.com"))
        assertEquals("wss://studio.example.com/base/callback/v1/connect", CallbackEndpoint.websocketUrl("wss://studio.example.com/base/"))
        runCatching { CallbackEndpoint.websocketUrl("http://studio.example.com") }.onSuccess { throw AssertionError("HTTP must be rejected") }
    }
}
