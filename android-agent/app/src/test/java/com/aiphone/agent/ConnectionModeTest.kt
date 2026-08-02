package com.aiphone.agent

import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectionModeTest {
    @Test
    fun `restores an explicitly stored mode`() {
        assertEquals(ConnectionMode.CLOUD, ConnectionMode.fromStorage("CLOUD", legacyCallbackEnabled = false))
        assertEquals(ConnectionMode.ADB, ConnectionMode.fromStorage("ADB", legacyCallbackEnabled = true))
    }

    @Test
    fun `migrates the legacy callback preference when mode is absent`() {
        assertEquals(ConnectionMode.CLOUD, ConnectionMode.fromStorage(null, legacyCallbackEnabled = true))
        assertEquals(ConnectionMode.ADB, ConnectionMode.fromStorage(null, legacyCallbackEnabled = false))
    }

    @Test
    fun `falls back to adb for an invalid stored mode`() {
        assertEquals(ConnectionMode.ADB, ConnectionMode.fromStorage("UNKNOWN", legacyCallbackEnabled = false))
    }
}
