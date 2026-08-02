package com.aiphone.agent

import com.aiphone.agent.callback.CallbackState
import com.aiphone.agent.callback.CallbackStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class AgentNotificationPresentationTest {
    @Test
    fun `adb mode reports local bridge readiness`() {
        val state = AgentNotificationPresentation.from(ConnectionMode.ADB, CallbackStatus(CallbackState.ERROR, "offline"))

        assertEquals("AIPhone Agent · ADB", state.title)
        assertEquals("Sẵn sàng nhận lệnh qua USB", state.text)
    }

    @Test
    fun `cloud mode reports the callback lifecycle`() {
        assertEquals(
            "Cloud · Đã kết nối Studio",
            AgentNotificationPresentation.from(ConnectionMode.CLOUD, CallbackStatus(CallbackState.ONLINE, "ready")).text,
        )
        assertEquals(
            "Cloud · Đang kết nối lại",
            AgentNotificationPresentation.from(ConnectionMode.CLOUD, CallbackStatus(CallbackState.ERROR, "network lost")).text,
        )
        assertEquals(
            "Cloud · Chờ xác thực pairing",
            AgentNotificationPresentation.from(ConnectionMode.CLOUD, CallbackStatus(CallbackState.WAITING_PAIRING, "pair")).text,
        )
    }
}
