package com.aiphone.agent.workflow

import com.aiphone.agent.accessibility.AIPhoneAccessibilityService
import com.aiphone.agent.accessibility.SelectorMatchMode
import com.aiphone.agent.accessibility.UiBounds
import com.aiphone.agent.accessibility.UiSelectorSpec
import com.aiphone.agent.root.RootGateway
import com.aiphone.agent.root.SafeCommands
import com.aiphone.agent.storage.AgentStore
import com.aiphone.agent.vision.Match
import com.aiphone.agent.vision.NormalizedRegion
import com.aiphone.agent.vision.VisionEngine
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

enum class RunState { IDLE, RUNNING, SUCCESS, FAILED, STOPPED }

data class RunSnapshot(
    val id: String = "idle",
    val state: RunState = RunState.IDLE,
    val currentNodeId: String? = null,
    val message: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val iteration: Int = 0,
    val logs: List<RunLogEntry> = emptyList(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("state", state.name)
        put("currentNodeId", currentNodeId ?: JSONObject.NULL)
        put("message", message ?: JSONObject.NULL)
        put("startedAt", startedAt ?: JSONObject.NULL)
        put("finishedAt", finishedAt ?: JSONObject.NULL)
        put("iteration", iteration)
        put("logs", JSONArray(logs.map { it.toJson() }))
    }
}

data class RunLogEntry(
    val timestamp: String,
    val level: String,
    val message: String,
    val nodeId: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("timestamp", timestamp)
        put("level", level)
        put("message", message)
        put("nodeId", nodeId ?: JSONObject.NULL)
    }
}

class WorkflowExecutor(
    private val store: AgentStore,
    private val ensureAccessibility: () -> Boolean = { AIPhoneAccessibilityService.instance != null },
) {
    private val status = AtomicReference(RunSnapshot())
    private val cancellation = AtomicBoolean(false)

    @Synchronized
    fun start(workflowId: String): RunSnapshot {
        validateWorkflowId(workflowId)
        val initial = beginRun()
        thread(name = "AIPhone-Workflow", isDaemon = true) { execute(initial.id, workflowId) }
        return initial
    }

    @Synchronized
    fun startNodeTest(workflowId: String, nodeId: String): RunSnapshot {
        validateWorkflowId(workflowId)
        require(nodeId.isNotBlank()) { "Node id is required" }
        val initial = beginRun()
        thread(name = "AIPhone-Node-Test", isDaemon = true) { executeSingleNode(initial.id, workflowId, nodeId) }
        return initial
    }

    fun stop(): RunSnapshot {
        cancellation.set(true)
        appendLog("WARN", "Đã nhận yêu cầu dừng")
        return status.get()
    }

    fun snapshot(): RunSnapshot = status.get()

    private fun beginRun(): RunSnapshot {
        check(status.get().state != RunState.RUNNING) { "A workflow is already running" }
        val startedAt = Instant.now().toString()
        val initial = RunSnapshot(
            id = UUID.randomUUID().toString(),
            state = RunState.RUNNING,
            startedAt = startedAt,
            logs = listOf(RunLogEntry(startedAt, "INFO", "Bắt đầu run")),
        )
        cancellation.set(false)
        status.set(initial)
        return initial
    }

    private fun validateWorkflowId(workflowId: String) {
        require(store.hasWorkflow(workflowId)) { "Unknown workflow $workflowId" }
    }

    private fun execute(runId: String, workflowId: String) {
        try {
            val document = JSONObject(store.readWorkflow(workflowId))
            val nodes = document.getJSONArray("nodes").asObjects().associateBy { it.getString("id") }
            val edges = document.getJSONArray("edges").asObjects().map {
                WorkflowEdgeRoute(
                    source = it.getString("source"),
                    target = it.getString("target"),
                    sourceHandle = it.optString("sourceHandle").ifBlank { null },
                )
            }
            var node = nodes.values.singleOrNull { it.getString("type") == "START" }
                ?: error("Workflow must contain exactly one START node")
            var iteration = 0
            var steps = 0

            while (!cancellation.get()) {
                check(++steps <= MAX_STEPS) { "Workflow exceeded $MAX_STEPS node executions" }
                val nodeId = node.getString("id")
                val nodeType = node.getString("type")
                val disabled = node.optBoolean("disabled", false)
                appendLog("INFO", "Bắt đầu node $nodeType", nodeId)
                if (!disabled && nodeType == "LOOP") {
                    val maximum = node.optJSONObject("config")?.optInt("maxIterations", 0) ?: 0
                    check(maximum <= 0 || iteration < maximum) { "Loop limit of $maximum iterations reached" }
                }
                status.updateAndGet { it.copy(currentNodeId = nodeId, iteration = iteration) }
                val outcome = (if (disabled) null else executeNode(node, runId, workflowId)).also {
                    if (!disabled && nodeType == "LOOP") iteration++
                }
                if (disabled) appendLog("WARN", "Bỏ qua node đang disable", nodeId)
                else appendLog("INFO", outcome?.let { "Kết quả: $it" } ?: "Node hoàn tất", nodeId)

                when (nodeType.takeUnless { disabled }) {
                    "SUCCESS" -> return finish(RunState.SUCCESS, node.optJSONObject("config")?.optString("message", "Hoàn tất"))
                    "FAILURE" -> return finish(RunState.FAILED, node.optJSONObject("config")?.optString("message", "Workflow thất bại"))
                }

                val nextEdge = selectNextRoute(edges, nodeId, outcome, disabled)
                node = nodes[nextEdge.target] ?: error("Missing target node")
            }
            finish(RunState.STOPPED, "Đã dừng theo yêu cầu")
        } catch (error: Throwable) {
            appendLog("ERROR", error.message ?: error.javaClass.simpleName)
            finish(RunState.FAILED, error.message ?: error.javaClass.simpleName)
        }
    }

    private fun executeSingleNode(runId: String, workflowId: String, requestedNodeId: String) {
        try {
            val document = JSONObject(store.readWorkflow(workflowId))
            val nodes = document.getJSONArray("nodes").asObjects()
            val index = selectSingleNodeIndex(nodes.map { it.getString("id") }, requestedNodeId)
            val node = nodes[index]
            status.updateAndGet { it.copy(currentNodeId = requestedNodeId) }
            appendLog("INFO", "Chạy thử node ${node.getString("type")}", requestedNodeId)
            val outcome = executeNode(node, runId, workflowId)
            if (cancellation.get()) return finish(RunState.STOPPED, "Đã dừng chạy thử node")
            appendLog("INFO", outcome?.let { "Kết quả: $it" } ?: "Node chạy thành công", requestedNodeId)
            when (node.getString("type")) {
                "FAILURE" -> finish(RunState.FAILED, node.optJSONObject("config")?.optString("message", "Node báo thất bại"))
                else -> finish(RunState.SUCCESS, outcome?.let { "Kết quả node: $it" } ?: "Node chạy thành công")
            }
        } catch (error: Throwable) {
            appendLog("ERROR", error.message ?: error.javaClass.simpleName, requestedNodeId)
            finish(RunState.FAILED, error.message ?: error.javaClass.simpleName)
        }
    }

    private fun executeNode(node: JSONObject, runId: String, workflowId: String): String? {
        val type = node.getString("type")
        val config = node.optJSONObject("config") ?: JSONObject()
        return when (type) {
            "START", "SUCCESS", "FAILURE" -> null
            "DELAY" -> {
                sleepCancellable(config.optLong("durationMs", 1000)); null
            }
            "WAIT_IMAGE" -> waitForImage(config, workflowId)
            "IF_IMAGE" -> if (findImage(config, workflowId) != null) "FOUND" else "TIMEOUT"
            "TAP_IMAGE" -> tapImage(config, workflowId)
            "TAP_TEXT" -> tapText(config, workflowId)
            "TAP_POINT" -> {
                requireSuccess(RootGateway.tap(config.getInt("x"), config.getInt("y")).isSuccess, "Tap failed"); null
            }
            "SWIPE" -> {
                requireSuccess(
                    RootGateway.swipe(config.getInt("x1"), config.getInt("y1"), config.getInt("x2"), config.getInt("y2"), config.optInt("durationMs", 400)).isSuccess,
                    "Swipe failed",
                ); null
            }
            "CREATE_CLONE" -> executeCommand(SafeCommands.createClone(packageName(config), userId(config)))
            "DELETE_CLONE" -> executeCommand(SafeCommands.deleteClone(packageName(config), userId(config)))
            "CLEAR_CLONE" -> executeCommand(SafeCommands.clearClone(packageName(config), userId(config)))
            "FORCE_STOP_APP" -> executeCommand(SafeCommands.forceStop(packageName(config), userId(config)))
            "LAUNCH_APP" -> launchApp(config)
            "CAPTURE" -> {
                File(store.runDirectory, "$runId-${node.getString("id")}.png").writeBytes(RootGateway.captureScreen()); null
            }
            "LOOP" -> null
            else -> error("Unsupported node type $type")
        }
    }

    private fun waitForImage(config: JSONObject, workflowId: String): String {
        val timeout = config.optLong("timeoutMs", 30_000).coerceIn(100, 600_000)
        val interval = config.optLong("pollIntervalMs", 500).coerceIn(100, 10_000)
        val deadline = System.currentTimeMillis() + timeout
        while (!cancellation.get() && System.currentTimeMillis() < deadline) {
            if (findImage(config, workflowId) != null) return "FOUND"
            sleepCancellable(interval)
        }
        return "TIMEOUT"
    }

    private fun findImage(config: JSONObject, workflowId: String): Match? {
        val assetId = config.optString("assetId").ifBlank { config.optString("templateId") }
        require(assetId.isNotBlank()) { "Image Asset is required" }
        val file = store.assetFile(workflowId, assetId)
        require(file.isFile) { "Image Asset $assetId is missing" }
        val regionJson = config.optJSONObject("searchRegion")
        val region = regionJson?.let {
            NormalizedRegion(it.getDouble("x"), it.getDouble("y"), it.getDouble("width"), it.getDouble("height"))
        }
        return VisionEngine.find(
            RootGateway.captureScreen(),
            file,
            config.optDouble("threshold", 0.88).coerceIn(0.5, 1.0),
            region,
        )
    }

    private fun tapImage(config: JSONObject, workflowId: String): String = TapImageRunner(
        findImage = { findImage(config, workflowId) },
        tap = RootGateway::tap,
        delay = ::sleepCancellable,
        log = { level, message -> appendLog(level, message) },
        isCancelled = cancellation::get,
    ).run(
        TapImageOptions(
            offsetX = config.optInt("offsetX", 0),
            offsetY = config.optInt("offsetY", 0),
            maxAttempts = config.optInt("tapAttempts", 2).coerceIn(1, 5),
            verificationDelayMs = config.optLong("tapVerificationDelayMs", 700).coerceIn(100, 5_000),
            verifyAfterTap = config.optBoolean("verifyTap", true),
        ),
    )

    private fun tapText(config: JSONObject, workflowId: String): String {
        check(ensureAccessibility()) { "AIPhone UI Inspector is not ready" }
        val assetId = config.getString("assetId")
        val assets = JSONObject(store.readWorkflow(workflowId)).getJSONArray("assets")
        val asset = (0 until assets.length()).map { assets.getJSONObject(it) }
            .singleOrNull { it.getString("id") == assetId && it.optString("type") == "UI_SELECTOR" }
            ?: error("UI selector Asset $assetId is missing")
        val selectorJson = asset.getJSONObject("selector")
        val boundsJson = selectorJson.optJSONObject("bounds")
        val selector = UiSelectorSpec(
            text = selectorJson.optString("text").ifBlank { null },
            contentDescription = selectorJson.optString("contentDescription").ifBlank { null },
            resourceId = selectorJson.optString("resourceId").ifBlank { null },
            className = selectorJson.optString("className").ifBlank { null },
            packageName = selectorJson.optString("packageName").ifBlank { null },
            bounds = boundsJson?.let { UiBounds(it.getInt("left"), it.getInt("top"), it.getInt("right"), it.getInt("bottom")) },
            matchMode = if (selectorJson.optString("matchMode") == "CONTAINS") SelectorMatchMode.CONTAINS else SelectorMatchMode.EXACT,
        )
        return TapTextRunner(
            click = { AIPhoneAccessibilityService.instance?.click(selector) ?: error("AIPhone UI Inspector disconnected") },
            tap = RootGateway::tap,
            delay = ::sleepCancellable,
            log = { level, message -> appendLog(level, message) },
            isCancelled = cancellation::get,
        ).run(
            timeoutMs = config.optLong("timeoutMs", 10_000),
            pollIntervalMs = config.optLong("pollIntervalMs", 400),
        )
    }

    private fun executeCommand(args: List<String>): String? {
        val result = RootGateway.executeSafe(args)
        if (result.text.isNotBlank()) appendLog(if (result.isSuccess) "INFO" else "ERROR", result.text)
        requireSuccess(result.isSuccess, result.text.ifBlank { "Root command failed" })
        return null
    }

    private fun launchApp(config: JSONObject): String? {
        val packageName = packageName(config)
        val userId = userId(config)
        val resolved = RootGateway.executeSafe(SafeCommands.resolveLauncher(packageName, userId))
        if (resolved.text.isNotBlank()) appendLog(if (resolved.isSuccess) "INFO" else "ERROR", resolved.text)
        requireSuccess(resolved.isSuccess, resolved.text.ifBlank { "Cannot resolve launcher activity" })
        val component = resolved.text.lineSequence()
            .map { it.trim() }
            .lastOrNull { it.startsWith("$packageName/") }
            ?: error("Cannot resolve launcher activity for $packageName in Android user $userId")
        return executeCommand(SafeCommands.launchComponent(packageName, userId, component))
    }

    private fun packageName(config: JSONObject) = config.optString("packageName", SafeCommands.TARGET_PACKAGE)
    private fun userId(config: JSONObject) = config.optInt("userId", SafeCommands.CLONE_USER_ID)

    private fun sleepCancellable(durationMs: Long) {
        var remaining = durationMs
        while (remaining > 0 && !cancellation.get()) {
            val chunk = minOf(remaining, 100)
            Thread.sleep(chunk)
            remaining -= chunk
        }
    }

    private fun requireSuccess(condition: Boolean, message: String) {
        check(condition) { message }
    }

    private fun finish(state: RunState, message: String?) {
        appendLog(if (state == RunState.FAILED) "ERROR" else "INFO", message ?: state.name)
        status.updateAndGet {
            it.copy(state = state, currentNodeId = null, message = message, finishedAt = Instant.now().toString())
        }
    }

    private fun appendLog(level: String, message: String, nodeId: String? = status.get().currentNodeId) {
        val entry = RunLogEntry(
            timestamp = Instant.now().toString(),
            level = level,
            message = message.take(MAX_LOG_MESSAGE_LENGTH),
            nodeId = nodeId,
        )
        status.updateAndGet { it.copy(logs = (it.logs + entry).takeLast(MAX_LOG_ENTRIES)) }
    }

    private fun JSONArray.asObjects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

    companion object {
        private const val MAX_STEPS = 100_000
        private const val MAX_LOG_ENTRIES = 200
        private const val MAX_LOG_MESSAGE_LENGTH = 2_000
    }
}
