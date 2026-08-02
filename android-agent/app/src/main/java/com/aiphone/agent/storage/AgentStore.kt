package com.aiphone.agent.storage

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom
import java.util.UUID

class AgentStore(context: Context) {
    private val root = File(context.filesDir, "aiphone").apply { mkdirs() }
    private val legacyWorkflowFile = File(root, "workflow-default.json")
    private val workflowDirectory = File(root, "workflows").apply { mkdirs() }
    private val accessTokenFile = File(root, "access-token.txt")
    private val assetDirectory = File(root, "assets").apply { mkdirs() }
    private val legacyTemplateDirectory = File(root, "templates").apply { mkdirs() }
    private val audioDirectory = File(root, "audio").apply { mkdirs() }
    val runDirectory = File(root, "runs").apply { mkdirs() }

    init {
        ensureStarterWorkflow()
        migrateLegacyAssets()
    }

    @Synchronized
    fun accessToken(): String {
        if (!accessTokenFile.exists()) {
            val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
            writeAtomically(accessTokenFile, bytes.joinToString("") { "%02x".format(it) }.toByteArray())
        }
        return accessTokenFile.readText().trim()
    }

    @Synchronized
    fun listWorkflows(): String {
        ensureStarterWorkflow()
        val summaries = workflowDirectory.listFiles { file -> file.isFile && file.extension == "json" }
            .orEmpty()
            .map { file -> workflowSummary(JSONObject(file.readText())) }
            .sortedByDescending { it.optString("updatedAt") }
        return JSONObject().put("workflows", JSONArray(summaries)).toString()
    }

    @Synchronized
    fun hasWorkflow(id: String): Boolean = workflowFile(id).isFile

    @Synchronized
    fun readWorkflow(id: String = DEFAULT_WORKFLOW_ID): String {
        val file = workflowFile(id)
        require(file.isFile) { "Unknown workflow $id" }
        return normalizeWorkflow(JSONObject(file.readText()), id).toString()
    }

    @Synchronized
    fun saveWorkflow(id: String, body: ByteArray): String {
        require(body.size <= MAX_WORKFLOW_BYTES) { "Workflow is too large" }
        val normalized = normalizeWorkflow(JSONObject(body.toString(Charsets.UTF_8)), id)
        writeAtomically(workflowFile(id), normalized.toString().toByteArray())
        return normalized.toString()
    }

    @Synchronized
    fun createWorkflow(body: ByteArray): String {
        require(body.size <= MAX_WORKFLOW_BYTES) { "Workflow is too large" }
        val json = JSONObject(body.toString(Charsets.UTF_8))
        val id = json.getString("id")
        require(!workflowFile(id).exists()) { "Workflow $id already exists" }
        return saveWorkflow(id, body)
    }

    @Synchronized
    fun deleteWorkflow(id: String) {
        val file = workflowFile(id)
        require(file.isFile) { "Unknown workflow $id" }
        val workflowCount = workflowDirectory.listFiles { candidate -> candidate.isFile && candidate.extension == "json" }?.size ?: 0
        check(workflowCount > 1) { "Cannot delete the final workflow" }
        check(file.delete()) { "Cannot delete workflow $id" }
        File(assetDirectory, id).deleteRecursively()
    }

    @Synchronized
    fun saveImageAsset(workflowId: String, body: ByteArray): String {
        validateId(workflowId, "Workflow")
        require(body.size <= MAX_ASSET_UPLOAD_BYTES) { "Asset upload is too large" }
        val upload = JSONObject(body.toString(Charsets.UTF_8))
        val record = upload.getJSONObject("record")
        val id = record.getString("id")
        require(record.optString("type", "IMAGE") == "IMAGE") { "Only IMAGE Assets accept PNG uploads" }
        require(record.optString("workflowId", workflowId) == workflowId) { "Asset belongs to another workflow" }
        validateId(id, "Asset")
        val dataUrl = upload.getString("imageBase64")
        val decoded = Base64.decode(dataUrl.substringAfter(',', dataUrl), Base64.DEFAULT)
        require(decoded.size <= MAX_ASSET_BYTES) { "Asset image is too large" }
        require(decoded.size >= PNG_SIGNATURE.size && PNG_SIGNATURE.indices.all { decoded[it] == PNG_SIGNATURE[it] }) {
            "Asset image must be a PNG"
        }
        val directory = File(assetDirectory, workflowId).apply { mkdirs() }
        writeAtomically(File(directory, "$id.png"), decoded)
        return record.apply {
            put("type", "IMAGE")
            put("workflowId", workflowId)
            put("sha256", ContentHash.sha256(decoded))
        }.toString()
    }

    @Synchronized
    fun workflowInventory(workflowId: String): JSONObject {
        validateId(workflowId, "Workflow")
        val file = workflowFile(workflowId)
        if (!file.isFile) {
            return JSONObject().put("workflowId", workflowId).put("exists", false).put("revision", 0).put("assets", JSONArray())
        }
        val workflow = normalizeWorkflow(JSONObject(file.readText()), workflowId)
        val inventory = JSONArray()
        val assets = workflow.getJSONArray("assets")
        for (index in 0 until assets.length()) {
            val asset = assets.getJSONObject(index)
            if (asset.optString("type", "IMAGE") != "IMAGE") continue
            val assetId = asset.getString("id")
            val image = assetFile(workflowId, assetId)
            if (image.isFile) inventory.put(JSONObject().put("id", assetId).put("sha256", ContentHash.sha256(image.readBytes())))
        }
        return JSONObject()
            .put("workflowId", workflowId)
            .put("exists", true)
            .put("revision", workflow.optInt("revision", 1))
            .put("assets", inventory)
    }

    @Synchronized
    fun deleteAssetFile(workflowId: String, assetId: String) {
        validateId(workflowId, "Workflow")
        validateId(assetId, "Asset")
        File(File(assetDirectory, workflowId), "$assetId.png").takeIf { it.exists() }?.delete()
    }

    fun assetFile(workflowId: String, id: String): File {
        validateId(workflowId, "Workflow")
        validateId(id, "Asset")
        val current = File(File(assetDirectory, workflowId), "$id.png")
        if (current.isFile) return current
        val legacyOwner = runCatching { JSONObject(legacyWorkflowFile.readText()).optString("id", DEFAULT_WORKFLOW_ID) }.getOrNull()
        return if (workflowId == legacyOwner) File(legacyTemplateDirectory, "$id.png") else current
    }

    @Synchronized
    fun createAudioArtifact(): Pair<String, File> {
        cleanupAudioArtifacts()
        val id = UUID.randomUUID().toString()
        return id to File(audioDirectory, "$id.wav")
    }

    fun audioArtifactFile(id: String): File {
        require(com.aiphone.agent.workflow.AudioArtifactId.isValid(id)) { "Audio artifact ID is invalid" }
        return File(audioDirectory, "$id.wav")
    }

    @Synchronized
    fun deleteAudioArtifact(id: String) {
        audioArtifactFile(id).takeIf { it.exists() }?.delete()
    }

    private fun workflowFile(id: String): File {
        validateId(id, "Workflow")
        return File(workflowDirectory, "$id.json")
    }

    private fun ensureStarterWorkflow() {
        if (workflowDirectory.listFiles { file -> file.isFile && file.extension == "json" }.orEmpty().isNotEmpty()) return
        val source = if (legacyWorkflowFile.isFile) JSONObject(legacyWorkflowFile.readText()) else JSONObject(STARTER_WORKFLOW)
        val id = source.optString("id", DEFAULT_WORKFLOW_ID)
        val normalized = normalizeWorkflow(source, id)
        writeAtomically(workflowFile(id), normalized.toString().toByteArray())
    }

    private fun migrateLegacyAssets() {
        if (!legacyWorkflowFile.isFile) return
        val sourceWorkflow = JSONObject(legacyWorkflowFile.readText())
        val legacy = normalizeWorkflow(sourceWorkflow, sourceWorkflow.optString("id", DEFAULT_WORKFLOW_ID))
        val workflowId = legacy.getString("id")
        val destination = File(assetDirectory, workflowId).apply { mkdirs() }
        val assets = legacy.getJSONArray("assets")
        for (index in 0 until assets.length()) {
            val asset = assets.getJSONObject(index)
            if (asset.optString("type", "IMAGE") != "IMAGE") continue
            val source = File(legacyTemplateDirectory, "${asset.getString("id")}.png")
            val target = File(destination, source.name)
            if (source.isFile && !target.exists()) writeAtomically(target, source.readBytes())
        }
    }

    private fun normalizeWorkflow(input: JSONObject, pathId: String): JSONObject {
        validateId(pathId, "Workflow")
        val bodyId = input.optString("id", pathId)
        require(bodyId == pathId) { "Workflow path and body IDs must match" }
        require(input.optInt("schemaVersion", 1) in 1..2) { "Unsupported workflow schema" }
        val nodes = input.optJSONArray("nodes") ?: error("Workflow nodes are required")
        val assets = input.optJSONArray("assets") ?: input.optJSONArray("templates") ?: JSONArray()

        for (index in 0 until nodes.length()) {
            val config = nodes.getJSONObject(index).optJSONObject("config") ?: continue
            if (!config.has("assetId") && config.has("templateId")) config.put("assetId", config.getString("templateId"))
            config.remove("templateId")
        }
        for (index in 0 until assets.length()) {
            assets.getJSONObject(index).apply {
                put("workflowId", pathId)
                if (!has("type")) put("type", "IMAGE")
            }
        }

        return input.apply {
            put("schemaVersion", 2)
            put("id", pathId)
            put("assets", assets)
            remove("templates")
        }
    }

    private fun workflowSummary(workflow: JSONObject): JSONObject {
        val normalized = normalizeWorkflow(workflow, workflow.getString("id"))
        return JSONObject().apply {
            put("id", normalized.getString("id"))
            put("name", normalized.optString("name", normalized.getString("id")))
            put("revision", normalized.optInt("revision", 1))
            put("nodeCount", normalized.getJSONArray("nodes").length())
            put("assetCount", normalized.getJSONArray("assets").length())
            put("updatedAt", normalized.optString("updatedAt"))
        }
    }

    private fun validateId(id: String, label: String) {
        require(ID_PATTERN.matches(id)) { "$label ID is invalid" }
    }

    private fun writeAtomically(target: File, bytes: ByteArray) {
        target.parentFile?.mkdirs()
        val temporary = File(target.parentFile, "${target.name}.tmp")
        temporary.writeBytes(bytes)
        check(temporary.renameTo(target) || run { target.delete(); temporary.renameTo(target) }) {
            "Cannot replace ${target.name}"
        }
    }

    private fun cleanupAudioArtifacts() {
        val files = audioDirectory.listFiles { file -> file.isFile && file.extension == "wav" }.orEmpty()
            .sortedByDescending { it.lastModified() }
        val cutoff = System.currentTimeMillis() - AUDIO_RETENTION_MS
        files.forEachIndexed { index, file ->
            if (index >= MAX_AUDIO_ARTIFACTS || file.lastModified() < cutoff) file.delete()
        }
    }

    companion object {
        const val DEFAULT_WORKFLOW_ID = "default-workflow"
        private val ID_PATTERN = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}")
        private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        private const val MAX_WORKFLOW_BYTES = 2 * 1024 * 1024
        private const val MAX_ASSET_BYTES = 8 * 1024 * 1024
        private const val MAX_ASSET_UPLOAD_BYTES = 12 * 1024 * 1024
        private const val MAX_AUDIO_ARTIFACTS = 100
        private const val AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000L
        private const val STARTER_WORKFLOW = """{"schemaVersion":2,"id":"default-workflow","name":"Liên Quân reroll","revision":1,"nodes":[{"id":"start","type":"START","position":{"x":80,"y":160},"config":{}},{"id":"success","type":"SUCCESS","position":{"x":420,"y":160},"config":{"message":"Hoàn tất"}}],"edges":[{"id":"start-success","source":"start","target":"success"}],"assets":[],"createdAt":"2026-07-29T00:00:00.000Z","updatedAt":"2026-07-29T00:00:00.000Z"}"""
    }
}
