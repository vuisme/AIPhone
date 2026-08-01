package com.aiphone.agent.callback

import java.net.URI

object CallbackEndpoint {
    fun websocketUrl(value: String): String {
        val input = value.trim()
        require(input.length in 1..2048) { "Callback URL không hợp lệ" }
        val uri = URI(input)
        require(uri.scheme.equals("https", true) || uri.scheme.equals("wss", true)) { "Cloud Callback bắt buộc dùng HTTPS/WSS" }
        require(!uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null) { "Callback URL không hợp lệ" }
        val basePath = uri.path.orEmpty().trimEnd('/')
        return URI("wss", null, uri.host, uri.port, "$basePath/callback/v1/connect", null, null).toString()
    }
}
