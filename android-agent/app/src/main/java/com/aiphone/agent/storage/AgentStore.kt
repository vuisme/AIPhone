package com.aiphone.agent.storage

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom

class AgentStore(context: Context) {
    private val root = File(context.filesDir, "aiphone").apply { mkdirs() }
    private val workflowFile = File(root, "workflow-default.json")
    private val accessTokenFile = File(root, "access-token.txt")
    private val templateDirectory = File(root, "templates").apply { mkdirs() }
    val runDirectory = File(root, "runs").apply { mkdirs() }

    @Synchronized
    fun accessToken(): String {
        if (!accessTokenFile.exists()) {
            val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
            writeAtomically(accessTokenFile, bytes.joinToString("") { "%02x".format(it) }.toByteArray())
        }
        return accessTokenFile.readText().trim()
    }

    @Synchronized
    fun readWorkflow(): String {
        if (!workflowFile.exists()) writeAtomically(workflowFile, STARTER_WORKFLOW.toByteArray())
        return workflowFile.readText()
    }

    @Synchronized
    fun saveWorkflow(body: ByteArray): String {
        require(body.size <= MAX_WORKFLOW_BYTES) { "Workflow is too large" }
        val json = JSONObject(body.toString(Charsets.UTF_8))
        require(json.optInt("schemaVersion") == 1) { "Unsupported workflow schema" }
        require(json.optJSONArray("nodes") != null) { "Workflow nodes are required" }
        writeAtomically(workflowFile, json.toString().toByteArray())
        return json.toString()
    }

    @Synchronized
    fun saveTemplate(body: ByteArray): String {
        require(body.size <= MAX_TEMPLATE_UPLOAD_BYTES) { "Template upload is too large" }
        val upload = JSONObject(body.toString(Charsets.UTF_8))
        val record = upload.getJSONObject("record")
        val id = record.getString("id")
        require(ID_PATTERN.matches(id)) { "Invalid template id" }
        val dataUrl = upload.getString("imageBase64")
        val encoded = dataUrl.substringAfter(',', dataUrl)
        val decoded = Base64.decode(encoded, Base64.DEFAULT)
        require(decoded.size <= MAX_TEMPLATE_BYTES) { "Template image is too large" }
        writeAtomically(File(templateDirectory, "$id.png"), decoded)
        return record.toString()
    }

    fun templateFile(id: String): File {
        require(ID_PATTERN.matches(id)) { "Invalid template id" }
        return File(templateDirectory, "$id.png")
    }

    private fun writeAtomically(target: File, bytes: ByteArray) {
        val temporary = File(target.parentFile, "${target.name}.tmp")
        temporary.writeBytes(bytes)
        check(temporary.renameTo(target) || run { target.delete(); temporary.renameTo(target) }) {
            "Cannot replace ${target.name}"
        }
    }

    companion object {
        private val ID_PATTERN = Regex("[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}")
        private const val MAX_WORKFLOW_BYTES = 2 * 1024 * 1024
        private const val MAX_TEMPLATE_BYTES = 8 * 1024 * 1024
        private const val MAX_TEMPLATE_UPLOAD_BYTES = 12 * 1024 * 1024
        private const val STARTER_WORKFLOW = """{"schemaVersion":1,"id":"default-workflow","name":"Liên Quân reroll","revision":1,"nodes":[{"id":"start","type":"START","position":{"x":80,"y":160},"config":{}},{"id":"success","type":"SUCCESS","position":{"x":420,"y":160},"config":{"message":"Hoàn tất"}}],"edges":[{"id":"start-success","source":"start","target":"success"}],"templates":[],"createdAt":"2026-07-29T00:00:00.000Z","updatedAt":"2026-07-29T00:00:00.000Z"}"""
    }
}
