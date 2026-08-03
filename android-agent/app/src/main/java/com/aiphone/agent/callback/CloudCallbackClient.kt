package com.aiphone.agent.callback

import android.content.Context
import android.os.Build
import android.util.Base64
import com.aiphone.agent.AgentPreferences
import com.aiphone.agent.BuildConfig
import com.aiphone.agent.storage.AgentStore
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

enum class CallbackState { DISABLED, CONNECTING, WAITING_PAIRING, ONLINE, ERROR }
data class CallbackStatus(val state: CallbackState, val message: String, val serial: String? = null, val accountName: String? = null)

class CloudCallbackClient(
    context: Context,
    private val store: AgentStore,
    private val onStatusChanged: ((CallbackStatus) -> Unit)? = null,
) {
    private val appContext = context.applicationContext
    private val preferences = AgentPreferences(appContext)
    private val running = AtomicBoolean(false)
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private val commands = Executors.newSingleThreadExecutor()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()
    private var socket: WebSocket? = null
    private var reconnectAttempt = 0
    private val reconnectScheduled = AtomicBoolean(false)

    fun start() {
        if (!preferences.callbackEnabled || !running.compareAndSet(false, true)) {
            if (!preferences.callbackEnabled) publish(CallbackState.DISABLED, "Cloud Callback đang tắt")
            return
        }
        connect()
    }

    fun stop() {
        running.set(false)
        socket?.close(1000, "Agent service stopped")
        socket = null
        scheduler.shutdownNow()
        commands.shutdownNow()
        http.dispatcher.executorService.shutdown()
        http.connectionPool.evictAll()
        publish(CallbackState.DISABLED, "Cloud Callback đã dừng")
    }

    private fun connect() {
        if (!running.get()) return
        reconnectScheduled.set(false)
        val target = runCatching { CallbackEndpoint.websocketUrl(preferences.callbackUrl) }.getOrElse {
            publish(CallbackState.ERROR, it.message ?: "Callback URL không hợp lệ")
            return
        }
        publish(CallbackState.CONNECTING, "Đang kết nối Studio...")
        runCatching {
            socket = http.newWebSocket(Request.Builder().url(target).build(), listener)
        }.onFailure {
            scheduleReconnect(it.message ?: "Không thể khởi tạo kết nối callback")
        }
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            socket = webSocket
            reconnectAttempt = 0
            val identity = preferences.callbackIdentity()
            webSocket.send(JSONObject()
                .put("type", "HELLO")
                .put("protocolVersion", 1)
                .put("deviceId", identity.deviceId)
                .put("deviceSecret", identity.deviceSecret)
                .put("pairingCodeHash", identity.pairingCodeHash())
                .put("pairingRequested", preferences.callbackPairingRequested)
                .put("metadata", JSONObject()
                    .put("model", Build.MODEL)
                    .put("androidVersion", Build.VERSION.RELEASE)
                    .put("agentVersion", BuildConfig.VERSION_NAME))
                .toString())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            runCatching {
                val message = JSONObject(text)
                when (message.getString("type")) {
                    "PAIRING_REQUIRED" -> {
                        preferences.callbackAccountName = ""
                        publish(CallbackState.WAITING_PAIRING, "Đang chờ xác thực trên Studio", accountName = null)
                    }
                    "READY", "PAIRED" -> {
                        preferences.completeCallbackPairing()
                        val accountName = message.optString("accountName").ifBlank { preferences.callbackAccountName }.ifBlank { null }
                        if (accountName != null) preferences.callbackAccountName = accountName
                        publish(CallbackState.ONLINE, "Đã kết nối Studio", message.optString("serial").ifBlank { null }, accountName)
                    }
                    "PAIRING_EXPIRED" -> {
                        preferences.rotateCallbackPairingCode()
                        publish(CallbackState.CONNECTING, "Mã pairing hết hạn; Agent đang tạo mã mới")
                        webSocket.close(4000, "Rotate pairing code")
                    }
                    "COMMAND" -> commands.execute { executeCommand(webSocket, message) }
                    "PONG" -> Unit
                    else -> error("Loại callback message không hỗ trợ")
                }
            }.onFailure { webSocket.close(1008, "Invalid callback message") }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (socket === webSocket) socket = null
            if (running.get()) scheduleReconnect("Kết nối callback đã đóng")
        }

        override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
            if (socket === webSocket) socket = null
            if (running.get()) scheduleReconnect(error.message ?: "Không thể kết nối callback")
        }
    }

    private fun scheduleReconnect(reason: String) {
        publish(CallbackState.ERROR, reason)
        if (!reconnectScheduled.compareAndSet(false, true)) return
        val delay = minOf(60L, 1L shl minOf(reconnectAttempt++, 6))
        scheduler.schedule(::connect, delay, TimeUnit.SECONDS)
    }

    private fun executeCommand(webSocket: WebSocket, command: JSONObject) {
        val requestId = command.getString("requestId")
        val result = runCatching {
            val method = command.getString("method").uppercase()
            val path = command.getString("path")
            require(method in setOf("GET", "POST", "PUT", "DELETE")) { "Callback method không hợp lệ" }
            require(path.startsWith("/api/") && !path.contains("..") && path.length <= 512) { "Callback path không hợp lệ" }
            val body = command.optString("bodyBase64").takeIf(String::isNotEmpty)?.let { Base64.decode(it, Base64.DEFAULT) } ?: byteArrayOf()
            require(body.size <= MAX_BODY_BYTES) { "Callback body quá lớn" }
            invokeLoopback(method, path, command.optJSONObject("headers") ?: JSONObject(), body)
        }.getOrElse { LocalResult(500, "application/json", JSONObject().put("error", JSONObject().put("code", "CALLBACK_COMMAND_FAILED").put("message", it.message ?: "Command failed")).toString().toByteArray()) }
        webSocket.send(JSONObject()
            .put("type", "RESULT")
            .put("requestId", requestId)
            .put("status", result.status)
            .put("contentType", result.contentType)
            .put("bodyBase64", Base64.encodeToString(result.body, Base64.NO_WRAP))
            .toString())
    }

    private fun invokeLoopback(method: String, path: String, headers: JSONObject, body: ByteArray): LocalResult {
        val connection = URL("http://127.0.0.1:8765$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = callbackReadTimeoutMs(path)
            connection.setRequestProperty("X-AIPhone-Token", store.accessToken())
            headers.optString("content-type").takeIf(String::isNotBlank)?.let { connection.setRequestProperty("Content-Type", it) }
            if (body.isNotEmpty()) {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
            }
            val status = connection.responseCode
            val responseBody = (if (status >= 400) connection.errorStream else connection.inputStream)?.use { it.readBytes() } ?: byteArrayOf()
            return LocalResult(status, connection.contentType ?: "application/octet-stream", responseBody)
        } finally {
            connection.disconnect()
        }
    }

    private fun publish(state: CallbackState, message: String, serial: String? = null, accountName: String? = preferences.callbackAccountName.ifBlank { null }) {
        status = CallbackStatus(state, message, serial, accountName)
        runCatching { onStatusChanged?.invoke(status) }
    }

    private data class LocalResult(val status: Int, val contentType: String, val body: ByteArray)

    companion object {
        @Volatile var status = CallbackStatus(CallbackState.DISABLED, "Cloud Callback đang tắt")
            private set

        fun reportServiceFailure(message: String): CallbackStatus =
            CallbackStatus(CallbackState.ERROR, message).also { status = it }

        private const val MAX_BODY_BYTES = 16 * 1024 * 1024
    }
}

internal fun callbackReadTimeoutMs(path: String): Int = when (path.substringBefore('?')) {
    "/api/vision/ocr-screen" -> 75_000
    "/api/screenshots" -> 45_000
    else -> 25_000
}
