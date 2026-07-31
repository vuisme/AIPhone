package com.aiphone.agent.server

import android.content.Context
import android.os.Build
import com.aiphone.agent.BuildConfig
import com.aiphone.agent.root.RootGateway
import com.aiphone.agent.root.SafeCommands
import com.aiphone.agent.storage.AgentStore
import com.aiphone.agent.workflow.WorkflowExecutor
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private data class HttpRequest(
    val method: String,
    val path: String,
    val headers: Map<String, String>,
    val body: ByteArray,
)

private data class HttpResponse(
    val status: Int,
    val contentType: String,
    val body: ByteArray,
) {
    companion object {
        fun json(status: Int = 200, body: JSONObject) = HttpResponse(status, "application/json; charset=utf-8", body.toString().toByteArray())
        fun text(status: Int, body: String) = HttpResponse(status, "text/plain; charset=utf-8", body.toByteArray())
    }
}

class AgentHttpServer(
    private val context: Context,
    private val store: AgentStore,
    private val executor: WorkflowExecutor,
) {
    private val running = AtomicBoolean(false)
    private val workers = Executors.newFixedThreadPool(4)
    private var socket: ServerSocket? = null

    fun start() {
        if (!running.compareAndSet(false, true)) return
        thread(name = "AIPhone-HTTP", isDaemon = true) {
            try {
                socket = ServerSocket(PORT, 20, InetAddress.getByName("127.0.0.1"))
                while (running.get()) {
                    val client = socket?.accept() ?: break
                    workers.execute { handleClient(client) }
                }
            } catch (_: Exception) {
                running.set(false)
            }
        }
    }

    fun stop() {
        running.set(false)
        socket?.close()
        workers.shutdownNow()
    }

    private fun handleClient(client: Socket) {
        client.use {
            try {
                it.soTimeout = 15_000
                val input = BufferedInputStream(it.getInputStream())
                val request = readRequest(input)
                val response = route(request)
                writeResponse(BufferedOutputStream(it.getOutputStream()), response)
            } catch (error: Throwable) {
                runCatching {
                    writeResponse(
                        BufferedOutputStream(it.getOutputStream()),
                        HttpResponse.json(500, errorJson("INTERNAL_ERROR", error.message ?: error.javaClass.simpleName)),
                    )
                }
            }
        }
    }

    private fun route(request: HttpRequest): HttpResponse {
        return try {
            if (request.path.startsWith("/api/") && request.headers["x-aiphone-token"] != store.accessToken()) {
                return HttpResponse.json(401, errorJson("UNAUTHORIZED", "Pairing token is missing or invalid"))
            }
            when {
                request.method == "GET" && request.path == "/api/device" -> deviceHealth()
                request.method == "POST" && request.path == "/api/screenshots" -> HttpResponse(200, "image/png", RootGateway.captureScreen())
                request.method == "GET" && request.path == "/api/workflows/default" -> HttpResponse(200, "application/json; charset=utf-8", store.readWorkflow().toByteArray())
                request.method == "PUT" && request.path == "/api/workflows/default" -> HttpResponse(200, "application/json; charset=utf-8", store.saveWorkflow(request.body).toByteArray())
                request.method == "PUT" && request.path.startsWith("/api/templates/") -> {
                    val pathId = request.path.substringAfterLast('/')
                    val bodyId = JSONObject(request.body.toString(Charsets.UTF_8)).getJSONObject("record").getString("id")
                    require(pathId == bodyId) { "Template path and body IDs must match" }
                    HttpResponse(200, "application/json; charset=utf-8", store.saveTemplate(request.body).toByteArray())
                }
                request.method == "POST" && request.path == "/api/runs" -> {
                    val workflowId = JSONObject(request.body.toString(Charsets.UTF_8)).optString("workflowId", "default-workflow")
                    HttpResponse.json(body = executor.start(workflowId).toJson())
                }
                request.method == "POST" && request.path == "/api/node-tests" -> {
                    val body = JSONObject(request.body.toString(Charsets.UTF_8))
                    val workflowId = body.optString("workflowId", "default-workflow")
                    val nodeId = body.getString("nodeId")
                    HttpResponse.json(body = executor.startNodeTest(workflowId, nodeId).toJson())
                }
                request.method == "GET" && request.path == "/api/runs/current" -> HttpResponse.json(body = executor.snapshot().toJson())
                request.method == "POST" && request.path == "/api/runs/current/stop" -> HttpResponse.json(body = executor.stop().toJson())
                request.method == "GET" && request.path.startsWith("/api/") -> HttpResponse.json(404, errorJson("NOT_FOUND", "Unknown API resource"))
                request.method == "OPTIONS" -> HttpResponse(204, "text/plain", byteArrayOf())
                request.method == "GET" -> staticAsset(request.path)
                else -> HttpResponse.json(405, errorJson("METHOD_NOT_ALLOWED", "Unsupported method"))
            }
        } catch (error: IllegalArgumentException) {
            HttpResponse.json(422, errorJson("VALIDATION_ERROR", error.message ?: "Invalid request"))
        } catch (error: IllegalStateException) {
            HttpResponse.json(409, errorJson("CONFLICT", error.message ?: "Operation cannot be completed"))
        }
    }

    private fun deviceHealth(): HttpResponse {
        val metrics = context.resources.displayMetrics
        val body = JSONObject().apply {
            put("model", Build.MODEL)
            put("androidVersion", Build.VERSION.RELEASE)
            put("hyperOsVersion", Build.VERSION.INCREMENTAL)
            put("rootGranted", RootGateway.isRootGranted())
            put("serverVersion", BuildConfig.VERSION_NAME)
            put("displayWidth", metrics.widthPixels)
            put("displayHeight", metrics.heightPixels)
            put("cloneUserId", SafeCommands.CLONE_USER_ID)
        }
        return HttpResponse.json(body = body)
    }

    private fun staticAsset(rawPath: String): HttpResponse {
        val decoded = URLDecoder.decode(rawPath.substringBefore('?'), Charsets.UTF_8.name())
        val relative = decoded.removePrefix("/").ifBlank { "index.html" }
        if (relative.contains("..") || relative.contains('\\')) return HttpResponse.text(400, "Invalid path")
        val assetPath = "studio/$relative"
        return try {
            HttpResponse(200, mimeType(relative), context.assets.open(assetPath).use { it.readBytes() })
        } catch (_: Exception) {
            HttpResponse(200, "text/html; charset=utf-8", context.assets.open("studio/index.html").use { it.readBytes() })
        }
    }

    private fun readRequest(input: BufferedInputStream): HttpRequest {
        val requestLine = readLine(input) ?: error("Empty request")
        val parts = requestLine.split(' ')
        require(parts.size >= 2) { "Invalid request line" }
        val headers = linkedMapOf<String, String>()
        while (true) {
            val line = readLine(input) ?: break
            if (line.isEmpty()) break
            val separator = line.indexOf(':')
            if (separator > 0) headers[line.substring(0, separator).lowercase()] = line.substring(separator + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        require(length in 0..MAX_BODY_BYTES) { "Request body is too large" }
        val body = ByteArray(length)
        var offset = 0
        while (offset < length) {
            val count = input.read(body, offset, length - offset)
            if (count < 0) error("Unexpected end of request body")
            offset += count
        }
        return HttpRequest(parts[0].uppercase(), parts[1].substringBefore('?'), headers, body)
    }

    private fun readLine(input: BufferedInputStream): String? {
        val bytes = ArrayList<Byte>()
        while (bytes.size < MAX_HEADER_LINE) {
            val value = input.read()
            if (value < 0) return if (bytes.isEmpty()) null else bytes.toByteArray().toString(Charsets.UTF_8)
            if (value == '\n'.code) break
            if (value != '\r'.code) bytes.add(value.toByte())
        }
        return bytes.toByteArray().toString(Charsets.UTF_8)
    }

    private fun writeResponse(output: BufferedOutputStream, response: HttpResponse) {
        val reason = when (response.status) {
            200 -> "OK"; 204 -> "No Content"; 400 -> "Bad Request"; 401 -> "Unauthorized"; 404 -> "Not Found"
            405 -> "Method Not Allowed"; 409 -> "Conflict"; 422 -> "Unprocessable Entity"; else -> "Internal Server Error"
        }
        val headers = buildString {
            append("HTTP/1.1 ${response.status} $reason\r\n")
            append("Content-Type: ${response.contentType}\r\n")
            append("Content-Length: ${response.body.size}\r\n")
            append("Cache-Control: no-store\r\n")
            append("X-Content-Type-Options: nosniff\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(headers.toByteArray())
        output.write(response.body)
        output.flush()
    }

    private fun errorJson(code: String, message: String) = JSONObject().put(
        "error",
        JSONObject().put("code", code).put("message", message),
    )

    private fun mimeType(path: String): String = when (path.substringAfterLast('.', "")) {
        "html" -> "text/html; charset=utf-8"
        "js" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "ico" -> "image/x-icon"
        else -> "application/octet-stream"
    }

    companion object {
        private const val PORT = 8765
        private const val MAX_BODY_BYTES = 16 * 1024 * 1024
        private const val MAX_HEADER_LINE = 16 * 1024
    }
}
