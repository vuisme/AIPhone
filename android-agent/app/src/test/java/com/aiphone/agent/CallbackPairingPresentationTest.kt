package com.aiphone.agent

import com.aiphone.agent.callback.CallbackState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CallbackPairingPresentationTest {
    @Test
    fun `cloud always exposes a pairing action while adb hides it`() {
        val online = CallbackPairingPresentation.from(ConnectionMode.CLOUD, CallbackState.ONLINE, pairingRequested = false)
        val adb = CallbackPairingPresentation.from(ConnectionMode.ADB, CallbackState.WAITING_PAIRING, pairingRequested = false)

        assertTrue(online.visible)
        assertEquals(CallbackPairingAction.START_NEW_PAIRING, online.action)
        assertEquals("Kết nối lại bằng mã pairing", online.buttonLabel)
        assertFalse(adb.visible)
    }

    @Test
    fun `an active pairing session reveals its current code instead of rotating again`() {
        val waiting = CallbackPairingPresentation.from(ConnectionMode.CLOUD, CallbackState.WAITING_PAIRING, pairingRequested = false)
        val reconnecting = CallbackPairingPresentation.from(ConnectionMode.CLOUD, CallbackState.CONNECTING, pairingRequested = true)

        assertEquals(CallbackPairingAction.REVEAL_CODE, waiting.action)
        assertEquals(CallbackPairingAction.REVEAL_CODE, reconnecting.action)
        assertEquals("Lấy mã pairing", waiting.buttonLabel)
    }
}
