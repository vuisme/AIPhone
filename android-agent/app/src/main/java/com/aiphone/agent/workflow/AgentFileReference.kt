package com.aiphone.agent.workflow

import org.json.JSONObject

data class AgentFileReference(
    val artifactId: String,
    val fileName: String,
    val mimeType: String,
    val absolutePath: String,
    val sizeBytes: Long,
    val downloadPath: String,
    val kind: String = "AIPHONE_ARTIFACT",
    val scope: String = "CURRENT_RUN_DEVICE",
    val visibility: String = "AGENT_PRIVATE",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("kind", kind)
        .put("scope", scope)
        .put("visibility", visibility)
        .put("artifactId", artifactId)
        .put("fileName", fileName)
        .put("mimeType", mimeType)
        .put("sizeBytes", sizeBytes)
        .put("path", absolutePath)
        .put("uri", "aiphone://artifact/$artifactId")
        .put("downloadPath", downloadPath)

    companion object {
        fun audioArtifact(artifactId: String, fileName: String, absolutePath: String, sizeBytes: Long): AgentFileReference {
            require(AudioArtifactId.isValid(artifactId)) { "Audio artifact ID is invalid" }
            require(fileName.isNotBlank()) { "Artifact file name is required" }
            require(absolutePath.isNotBlank()) { "Artifact path is required" }
            require(sizeBytes >= 0) { "Artifact size cannot be negative" }
            return AgentFileReference(
                artifactId = artifactId,
                fileName = fileName,
                mimeType = "audio/wav",
                absolutePath = absolutePath,
                sizeBytes = sizeBytes,
                downloadPath = "/api/runs/audio/$artifactId",
            )
        }
    }
}
