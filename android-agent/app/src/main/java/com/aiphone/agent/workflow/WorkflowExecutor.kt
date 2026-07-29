package com.aiphone.agent.workflow

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
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("state", state.name)
        put("currentNodeId", currentNodeId ?: JSONObject.NULL)
        put("message", message ?: JSONObject.NULL)
        put("startedAt", startedAt ?: JSONObject.NULL)
        put("finishedAt", finishedAt ?: JSONObject.NULL)
        put("iteration", iteration)
    }
}

class WorkflowExecutor(private val store: AgentStore) {
    private val status = AtomicReference(RunSnapshot())
    private val cancellation = AtomicBoolean(false)

    @Synchronized
    fun start(workflowId: String): RunSnapshot {
        require(workflowId == "default-workflow" || workflowId == "lien-quan-reroll") { "Unknown workflow" }
        check(status.get().state != RunState.RUNNING) { "A workflow is already running" }
        val initial = RunSnapshot(
            id = UUID.randomUUID().toString(),
            state = RunState.RUNNING,
            startedAt = Instant.now().toString(),
        )
        cancellation.set(false)
        status.set(initial)
        thread(name = "AIPhone-Workflow", isDaemon = true) { execute(initial.id) }
        return initial
    }

    fun stop(): RunSnapshot {
        cancellation.set(true)
        return status.get()
    }

    fun snapshot(): RunSnapshot = status.get()

    private fun execute(runId: String) {
        try {
            val document = JSONObject(store.readWorkflow())
            val nodes = document.getJSONArray("nodes").asObjects().associateBy { it.getString("id") }
            val edges = document.getJSONArray("edges").asObjects()
            var node = nodes.values.singleOrNull { it.getString("type") == "START" }
                ?: error("Workflow must contain exactly one START node")
            var iteration = 0
            var steps = 0

            while (!cancellation.get()) {
                check(++steps <= MAX_STEPS) { "Workflow exceeded $MAX_STEPS node executions" }
                val nodeId = node.getString("id")
                status.updateAndGet { it.copy(currentNodeId = nodeId, iteration = iteration) }
                val outcome = executeNode(node, runId).also {
                    if (node.getString("type") == "LOOP") iteration++
                }

                when (node.getString("type")) {
                    "SUCCESS" -> return finish(RunState.SUCCESS, node.optJSONObject("config")?.optString("message", "Hoàn tất"))
                    "FAILURE" -> return finish(RunState.FAILED, node.optJSONObject("config")?.optString("message", "Workflow thất bại"))
                }

                val nextEdge = edges.firstOrNull {
                    it.getString("source") == nodeId && outcome != null && it.optString("sourceHandle") == outcome
                } ?: edges.firstOrNull {
                    it.getString("source") == nodeId && it.optString("sourceHandle").isBlank()
                } ?: error("Node $nodeId has no edge for outcome ${outcome ?: "DEFAULT"}")
                node = nodes[nextEdge.getString("target")] ?: error("Missing target node")
            }
            finish(RunState.STOPPED, "Đã dừng theo yêu cầu")
        } catch (error: Throwable) {
            finish(RunState.FAILED, error.message ?: error.javaClass.simpleName)
        }
    }

    private fun executeNode(node: JSONObject, runId: String): String? {
        val type = node.getString("type")
        val config = node.optJSONObject("config") ?: JSONObject()
        return when (type) {
            "START", "SUCCESS", "FAILURE" -> null
            "DELAY" -> {
                sleepCancellable(config.optLong("durationMs", 1000)); null
            }
            "WAIT_IMAGE" -> waitForImage(config)
            "IF_IMAGE" -> if (findImage(config) != null) "FOUND" else "TIMEOUT"
            "TAP_IMAGE" -> {
                val match = findImage(config) ?: return "TIMEOUT"
                val x = match.x + match.width / 2 + config.optInt("offsetX", 0)
                val y = match.y + match.height / 2 + config.optInt("offsetY", 0)
                requireSuccess(RootGateway.tap(x, y).isSuccess, "Tap failed")
                "FOUND"
            }
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
            "LAUNCH_APP" -> executeCommand(SafeCommands.launch(packageName(config), userId(config)))
            "CAPTURE" -> {
                File(store.runDirectory, "$runId-${node.getString("id")}.png").writeBytes(RootGateway.captureScreen()); null
            }
            "LOOP" -> null
            else -> error("Unsupported node type $type")
        }
    }

    private fun waitForImage(config: JSONObject): String {
        val timeout = config.optLong("timeoutMs", 30_000).coerceIn(100, 600_000)
        val interval = config.optLong("pollIntervalMs", 500).coerceIn(100, 10_000)
        val deadline = System.currentTimeMillis() + timeout
        while (!cancellation.get() && System.currentTimeMillis() < deadline) {
            if (findImage(config) != null) return "FOUND"
            sleepCancellable(interval)
        }
        return "TIMEOUT"
    }

    private fun findImage(config: JSONObject): Match? {
        val templateId = config.getString("templateId")
        val file = store.templateFile(templateId)
        require(file.isFile) { "Template $templateId is missing" }
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

    private fun executeCommand(args: List<String>): String? {
        val result = RootGateway.executeSafe(args)
        requireSuccess(result.isSuccess, result.text.ifBlank { "Root command failed" })
        return null
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
        status.updateAndGet {
            it.copy(state = state, currentNodeId = null, message = message, finishedAt = Instant.now().toString())
        }
    }

    private fun JSONArray.asObjects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

    companion object {
        private const val MAX_STEPS = 100_000
    }
}

