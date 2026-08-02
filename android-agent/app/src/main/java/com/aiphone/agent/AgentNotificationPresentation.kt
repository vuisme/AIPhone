package com.aiphone.agent

import com.aiphone.agent.callback.CallbackState
import com.aiphone.agent.callback.CallbackStatus

data class AgentNotificationState(val title: String, val text: String)

object AgentNotificationPresentation {
    fun from(mode: ConnectionMode, callback: CallbackStatus): AgentNotificationState {
        if (mode == ConnectionMode.ADB) {
            return AgentNotificationState("AIPhone Agent · ADB", "Sẵn sàng nhận lệnh qua USB")
        }
        val text = when (callback.state) {
            CallbackState.ONLINE -> "Cloud · Đã kết nối Studio"
            CallbackState.CONNECTING -> "Cloud · Đang kết nối Studio"
            CallbackState.WAITING_PAIRING -> "Cloud · Chờ xác thực pairing"
            CallbackState.ERROR -> "Cloud · Đang kết nối lại"
            CallbackState.DISABLED -> "Cloud · Callback chưa khởi động"
        }
        return AgentNotificationState("AIPhone Agent · Cloud", text)
    }
}
