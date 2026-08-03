package com.aiphone.agent

import com.aiphone.agent.callback.CallbackState

enum class CallbackPairingAction { REVEAL_CODE, START_NEW_PAIRING }

data class CallbackPairingState(
    val visible: Boolean,
    val action: CallbackPairingAction,
    val buttonLabel: String,
    val description: String,
)

object CallbackPairingPresentation {
    fun from(mode: ConnectionMode, callbackState: CallbackState, pairingRequested: Boolean): CallbackPairingState {
        val pairingActive = callbackState == CallbackState.WAITING_PAIRING || pairingRequested
        return CallbackPairingState(
            visible = mode == ConnectionMode.CLOUD,
            action = if (pairingActive) CallbackPairingAction.REVEAL_CODE else CallbackPairingAction.START_NEW_PAIRING,
            buttonLabel = if (pairingActive) "Lấy mã pairing" else "Kết nối lại bằng mã pairing",
            description = if (pairingActive) {
                "Mã hiện tại chỉ dùng một lần và tự đổi khi hết hạn."
            } else {
                "Tạo phiên pairing mới khi bạn muốn liên kết lại thiết bị với tài khoản Studio."
            },
        )
    }
}
