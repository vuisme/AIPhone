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
    val variables: Map<String, RunValue> = emptyMap(),
    val lastResult: NodeResult? = null,
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
        put("variables", JSONObject().apply { variables.forEach { (name, value) -> put(name, value.toJson()) } })
        put("lastResult", lastResult?.toJson() ?: JSONObject.NULL)
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
    private val ttsGateway: TtsGateway? = null,
    private val screenCapture: () -> ByteArray,
    private val ensureAccessibility: () -> Boolean = { AIPhoneAccessibilityService.instance != null },
    private val launchMainApp: (String) -> com.aiphone.agent.root.CommandResult = { com.aiphone.agent.root.CommandResult(-1, "Main-user launch is unavailable".toByteArray()) },
) {
    private val status = AtomicReference(RunSnapshot())
    private val cancellation = AtomicBoolean(false)

    @Synchronized
    fun start(workflowId: String): RunSnapshot {
        validateWorkflowId(workflowId)
        validateCapabilities(workflowId)
        val initial = beginRun()
        thread(name = "AIPhone-Workflow", isDaemon = true) { execute(initial.id, workflowId) }
        return initial
    }

    @Synchronized
    fun startNodeTest(workflowId: String, nodeId: String): RunSnapshot {
        validateWorkflowId(workflowId)
        require(nodeId.isNotBlank()) { "Node id is required" }
        validateCapabilities(workflowId, nodeId)
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

    private fun validateCapabilities(workflowId: String, onlyNodeId: String? = null) {
        val document = JSONObject(store.readWorkflow(workflowId))
        val nodes = document.getJSONArray("nodes").asObjects().filter { !it.optBoolean("disabled", false) && (onlyNodeId == null || it.getString("id") == onlyNodeId) }
        if (onlyNodeId != null) require(nodes.isNotEmpty()) { "Unknown or disabled node $onlyNodeId" }
        val hasRoot = RootGateway.isRootGranted()
        val needsAccessibility = nodes.any {
            when (NodeCapabilityPolicy.requirement(it.getString("type"), capabilityUserId(it))) {
                NodeRequirement.ACCESSIBILITY -> true
                NodeRequirement.ACCESSIBILITY_OR_ROOT -> !hasRoot
                else -> false
            }
        }
        val hasAccessibility = !needsAccessibility || ensureAccessibility()
        val issues = nodes.mapNotNull {
            NodeCapabilityPolicy.validate(
                nodeType = it.getString("type"),
                androidUserId = capabilityUserId(it),
                hasRoot = hasRoot,
                hasAccessibility = hasAccessibility,
            )?.let { message -> "${it.getString("id")}: $message" }
        }
        require(issues.isEmpty()) { issues.joinToString("; ") }
    }

    private fun capabilityUserId(node: JSONObject): Int {
        val type = node.getString("type")
        val fallback = if (type in setOf("LAUNCH_APP", "FORCE_STOP_APP", "CREATE_CLONE", "DELETE_CLONE", "CLEAR_CLONE")) SafeCommands.CLONE_USER_ID else 0
        val rawUserId = node.optJSONObject("config")?.opt("userId")
        if (type == "LAUNCH_APP" && rawUserId is String && rawUserId.contains("{{")) return 0
        return node.optJSONObject("config")?.optInt("userId", fallback) ?: fallback
    }

    private fun execute(runId: String, workflowId: String) {
        try {
            val document = JSONObject(store.readWorkflow(workflowId))
            val context = RunContext.fromWorkflow(document)
            status.updateAndGet { it.copy(variables = context.snapshot()) }
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
                    val maximum = context.resolveConfig(node.optJSONObject("config") ?: JSONObject()).optInt("maxIterations", 0)
                    check(maximum <= 0 || iteration < maximum) { "Loop limit of $maximum iterations reached" }
                }
                status.updateAndGet { it.copy(currentNodeId = nodeId, iteration = iteration) }
                val result = (if (disabled) null else executeNode(node, runId, workflowId, context)).also {
                    if (!disabled && nodeType == "LOOP") iteration++
                }
                if (disabled) appendLog("WARN", "Bỏ qua node đang disable", nodeId)
                else appendLog("INFO", result?.description() ?: "Node hoàn tất", nodeId)
                status.updateAndGet { it.copy(variables = context.snapshot(), lastResult = result) }
                if (cancellation.get()) return finish(RunState.STOPPED, "Đã dừng theo yêu cầu")

                when (nodeType.takeUnless { disabled }) {
                    "SUCCESS" -> return finish(RunState.SUCCESS, context.interpolate(node.optJSONObject("config")?.optString("message", "Hoàn tất") ?: "Hoàn tất"))
                    "FAILURE" -> return finish(RunState.FAILED, context.interpolate(node.optJSONObject("config")?.optString("message", "Workflow thất bại") ?: "Workflow thất bại"))
                }

                val nextEdge = selectNextRoute(edges, nodeId, result?.outcome, disabled)
                node = nodes[nextEdge.target] ?: error("Missing target node")
            }
            finish(RunState.STOPPED, "Đã dừng theo yêu cầu")
        } catch (error: Throwable) {
            val detail = describeThrowable(error)
            appendLog("ERROR", detail)
            finish(RunState.FAILED, detail)
        }
    }

    private fun executeSingleNode(runId: String, workflowId: String, requestedNodeId: String) {
        try {
            val document = JSONObject(store.readWorkflow(workflowId))
            val context = RunContext.fromWorkflow(document)
            status.updateAndGet { it.copy(variables = context.snapshot()) }
            val nodes = document.getJSONArray("nodes").asObjects()
            val index = selectSingleNodeIndex(nodes.map { it.getString("id") }, requestedNodeId)
            val node = nodes[index]
            status.updateAndGet { it.copy(currentNodeId = requestedNodeId) }
            appendLog("INFO", "Chạy thử node ${node.getString("type")}", requestedNodeId)
            val result = executeNode(node, runId, workflowId, context)
            status.updateAndGet { it.copy(variables = context.snapshot(), lastResult = result) }
            if (cancellation.get()) return finish(RunState.STOPPED, "Đã dừng chạy thử node")
            appendLog("INFO", result.description() ?: "Node chạy thành công", requestedNodeId)
            when (node.getString("type")) {
                "FAILURE" -> finish(RunState.FAILED, context.interpolate(node.optJSONObject("config")?.optString("message", "Node báo thất bại") ?: "Node báo thất bại"))
                else -> finish(RunState.SUCCESS, result.description() ?: "Node chạy thành công")
            }
        } catch (error: Throwable) {
            val detail = describeThrowable(error)
            appendLog("ERROR", detail, requestedNodeId)
            finish(RunState.FAILED, detail)
        }
    }

    private fun executeNode(node: JSONObject, runId: String, workflowId: String, context: RunContext): NodeResult {
        val type = node.getString("type")
        val config = context.resolveConfig(node.optJSONObject("config") ?: JSONObject())
        return when (type) {
            "START", "SUCCESS", "FAILURE" -> NodeResult()
            "DELAY" -> {
                val duration = config.optLong("durationMs", 1000)
                sleepCancellable(duration)
                NodeResult(metadata = mapOf("durationMs" to duration))
            }
            "SET_VARIABLE" -> setVariable(config, context)
            "IF" -> evaluateCondition(context, conditionSpec(config))
            "LOG" -> {
                val message = config.optString("message")
                appendLog("INFO", message)
                NodeResult(value = RunValue(WorkflowValueType.STRING, message))
            }
            "TTS_SPEAK" -> speakText(config, context)
            "WAIT_IMAGE" -> NodeResult(outcome = waitForImage(config, workflowId))
            "IF_IMAGE" -> NodeResult(outcome = if (findImage(config, workflowId) != null) "FOUND" else "TIMEOUT")
            "TAP_IMAGE" -> NodeResult(outcome = tapImage(config, workflowId))
            "TAP_TEXT" -> NodeResult(outcome = tapText(config, workflowId))
            "TAP_POINT" -> {
                requireSuccess(tap(config.getInt("x"), config.getInt("y")).isSuccess, "Tap failed"); NodeResult()
            }
            "SWIPE" -> {
                requireSuccess(
                    swipe(config.getInt("x1"), config.getInt("y1"), config.getInt("x2"), config.getInt("y2"), config.optInt("durationMs", 400)).isSuccess,
                    "Swipe failed",
                ); NodeResult()
            }
            "CREATE_CLONE" -> { executeCommand(SafeCommands.createClone(packageName(config), userId(config))); NodeResult() }
            "DELETE_CLONE" -> { executeCommand(SafeCommands.deleteClone(packageName(config), userId(config))); NodeResult() }
            "CLEAR_CLONE" -> { executeCommand(SafeCommands.clearClone(packageName(config), userId(config))); NodeResult() }
            "FORCE_STOP_APP" -> { executeCommand(SafeCommands.forceStop(packageName(config), userId(config))); NodeResult() }
            "LAUNCH_APP" -> launchApp(config)
            "CAPTURE" -> {
                val output = File(store.runDirectory, "$runId-${node.getString("id")}.png")
                output.writeBytes(screenCapture())
                NodeResult(metadata = mapOf("fileName" to output.name))
            }
            "LOOP" -> NodeResult()
            else -> error("Unsupported node type $type")
        }
    }

    private fun setVariable(config: JSONObject, context: RunContext): NodeResult {
        val name = config.getString("name")
        val type = WorkflowValueType.valueOf(config.optString("valueType", WorkflowValueType.STRING.name))
        val rawValue = config.opt("value")
        val value = RunValue.fromLiteral(type, rawValue)
        context.set(name, value)
        return NodeResult(value = value, metadata = mapOf("name" to name))
    }

    private fun speakText(config: JSONObject, context: RunContext): NodeResult {
        val gateway = ttsGateway ?: error("Android TTS is unavailable")
        val options = TtsSpeakOptions.fromResolvedConfig(config)
        val (artifactId, outputFile) = store.createAudioArtifact()
        return try {
            val synthesis = gateway.synthesize(options, outputFile, cancellation::get)
            val keepAudio = options.saveAudio
            val fileReference = if (keepAudio) AgentFileReference.audioArtifact(
                artifactId = artifactId,
                fileName = outputFile.name,
                absolutePath = outputFile.absolutePath,
                sizeBytes = outputFile.length(),
            ).toJson() else null
            val output = JSONObject()
                .put("text", options.text)
                .put("artifactId", if (keepAudio) artifactId else JSONObject.NULL)
                .put("fileName", if (keepAudio) outputFile.name else JSONObject.NULL)
                .put("file", fileReference ?: JSONObject.NULL)
                .put("engine", synthesis.enginePackage)
                .put("voice", synthesis.voiceName)
                .put("languageTag", synthesis.languageTag)
                .put("played", synthesis.played)
                .put("saved", keepAudio)
                .put("durationMs", synthesis.durationMs)
            if (!keepAudio) store.deleteAudioArtifact(artifactId)
            TtsResultBinder.assign(context, options.outputVariable, output)
            NodeResult(
                outcome = "SPOKEN",
                value = RunValue(WorkflowValueType.JSON, output),
                metadata = mapOf(
                    "audioAvailable" to keepAudio,
                    "artifactId" to if (keepAudio) artifactId else null,
                    "outputVariable" to options.outputVariable,
                ),
            )
        } catch (error: Throwable) {
            store.deleteAudioArtifact(artifactId)
            if (cancellation.get()) return NodeResult(outcome = "CANCELLED")
            throw error
        }
    }

    private fun conditionSpec(config: JSONObject): ConditionSpec {
        val left = ValueOperand.variable(config.getString("leftVariable"))
        val operator = ConditionOperator.valueOf(config.optString("operator", ConditionOperator.EQUALS.name))
        if (operator == ConditionOperator.IS_EMPTY || operator == ConditionOperator.IS_NOT_EMPTY) return ConditionSpec(left, operator)
        val right = if (config.optString("rightSource", "LITERAL") == "VARIABLE") {
            ValueOperand.variable(config.getString("rightVariable"))
        } else {
            val type = WorkflowValueType.valueOf(config.optString("rightType", WorkflowValueType.STRING.name))
            ValueOperand.literal(type, config.opt("rightValue"))
        }
        return ConditionSpec(left, operator, right)
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
            screenCapture(),
            file,
            config.optDouble("threshold", 0.88).coerceIn(0.5, 1.0),
            region,
        )
    }

    private fun tapImage(config: JSONObject, workflowId: String): String = TapImageRunner(
        findImage = { findImage(config, workflowId) },
        tap = ::tap,
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
            tap = ::tap,
            delay = ::sleepCancellable,
            log = { level, message -> appendLog(level, message) },
            isCancelled = cancellation::get,
        ).run(
            timeoutMs = config.optLong("timeoutMs", 10_000),
            pollIntervalMs = config.optLong("pollIntervalMs", 400),
        )
    }

    private fun executeCommand(args: List<String>): String? {
        check(RootGateway.isRootGranted()) { "Root command requires KernelSU permission" }
        val result = RootGateway.executeSafe(args)
        if (result.text.isNotBlank()) appendLog(if (result.isSuccess) "INFO" else "ERROR", result.text)
        requireSuccess(result.isSuccess, result.text.ifBlank { "Root command failed" })
        return null
    }

    private fun launchApp(config: JSONObject): NodeResult {
        val packageName = packageName(config)
        val userId = userId(config)
        if (userId == 0 && !RootGateway.isRootGranted()) {
            val result = launchMainApp(packageName)
            if (result.text.isNotBlank()) appendLog(if (result.isSuccess) "INFO" else "ERROR", result.text)
            requireSuccess(result.isSuccess, result.text.ifBlank { "Cannot launch $packageName" })
            return NodeResult()
        }
        check(RootGateway.isRootGranted()) { "Launching Android user $userId requires KernelSU permission" }
        val resolved = RootGateway.executeSafe(SafeCommands.resolveLauncher(packageName, userId))
        if (resolved.text.isNotBlank()) appendLog(if (resolved.isSuccess) "INFO" else "ERROR", resolved.text)
        requireSuccess(resolved.isSuccess, resolved.text.ifBlank { "Cannot resolve launcher activity" })
        val component = resolved.text.lineSequence()
            .map { it.trim() }
            .lastOrNull { it.startsWith("$packageName/") }
            ?: error("Cannot resolve launcher activity for $packageName in Android user $userId")
        executeCommand(SafeCommands.launchComponent(packageName, userId, component))
        return NodeResult()
    }

    private fun packageName(config: JSONObject) = config.optString("packageName", SafeCommands.TARGET_PACKAGE).trim()
    private fun userId(config: JSONObject) = config.optInt("userId", SafeCommands.CLONE_USER_ID)

    private fun sleepCancellable(durationMs: Long) {
        var remaining = durationMs
        while (remaining > 0 && !cancellation.get()) {
            val chunk = minOf(remaining, 100)
            Thread.sleep(chunk)
            remaining -= chunk
        }
    }

    private fun tap(x: Int, y: Int): com.aiphone.agent.root.CommandResult {
        if (RootGateway.isRootGranted()) return RootGateway.tap(x, y)
        val service = AIPhoneAccessibilityService.instance
            ?: return com.aiphone.agent.root.CommandResult(-1, "AIPhone UI Inspector is not enabled".toByteArray())
        return if (service.tap(x, y)) com.aiphone.agent.root.CommandResult(0, byteArrayOf())
        else com.aiphone.agent.root.CommandResult(-1, "Accessibility tap failed at ($x, $y)".toByteArray())
    }

    private fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Int): com.aiphone.agent.root.CommandResult {
        if (RootGateway.isRootGranted()) return RootGateway.swipe(x1, y1, x2, y2, durationMs)
        val service = AIPhoneAccessibilityService.instance
            ?: return com.aiphone.agent.root.CommandResult(-1, "AIPhone UI Inspector is not enabled".toByteArray())
        return if (service.swipe(x1, y1, x2, y2, durationMs)) com.aiphone.agent.root.CommandResult(0, byteArrayOf())
        else com.aiphone.agent.root.CommandResult(-1, "Accessibility swipe failed".toByteArray())
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
