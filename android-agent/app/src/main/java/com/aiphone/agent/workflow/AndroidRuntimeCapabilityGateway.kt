package com.aiphone.agent.workflow

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.speech.RecognitionService
import org.json.JSONArray
import org.json.JSONObject

data class AndroidAiServiceCapability(
    val type: String,
    val label: String,
    val packageName: String,
    val serviceName: String,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("type", type)
        .put("label", label)
        .put("packageName", packageName)
        .put("serviceName", serviceName)
}

data class AndroidRuntimeCapabilities(
    val tts: TtsCapabilities,
    val aiServices: List<AndroidAiServiceCapability>,
    val warnings: List<String>,
    val discoveredAt: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("tts", tts.toJson())
        .put("aiServices", JSONArray(aiServices.map { it.toJson() }))
        .put("warnings", JSONArray(warnings))
        .put("modelDiscovery", "ANDROID_PUBLIC_APIS")
        .put("discoveredAt", discoveredAt)
}

interface RuntimeCapabilityGateway {
    fun capabilities(forceRefresh: Boolean = false): AndroidRuntimeCapabilities
}

class AndroidRuntimeCapabilityGateway(
    context: Context,
    private val ttsGateway: TtsGateway,
) : RuntimeCapabilityGateway {
    private val applicationContext = context.applicationContext

    override fun capabilities(forceRefresh: Boolean): AndroidRuntimeCapabilities {
        val warnings = mutableListOf<String>()
        val tts = runCatching { if (forceRefresh) ttsGateway.refreshCapabilities() else ttsGateway.capabilities() }.getOrElse { error ->
            warnings += "TTS discovery failed: ${error.message ?: error.javaClass.simpleName}"
            TtsCapabilities(available = false, defaultEngine = null, engines = emptyList())
        }
        val aiServices = listOf(
            RecognitionService.SERVICE_INTERFACE to "SPEECH_RECOGNITION",
            TEXT_CLASSIFIER_SERVICE to "TEXT_CLASSIFIER",
        ).flatMap { (action, type) ->
            runCatching { discoverServices(action, type) }.getOrElse { error ->
                warnings += "$type discovery failed: ${error.message ?: error.javaClass.simpleName}"
                emptyList()
            }
        }.distinctBy { "${it.type}:${it.packageName}:${it.serviceName}" }
            .sortedWith(compareBy(AndroidAiServiceCapability::type, AndroidAiServiceCapability::label))
        return AndroidRuntimeCapabilities(
            tts = tts,
            aiServices = aiServices,
            warnings = warnings,
            discoveredAt = System.currentTimeMillis(),
        )
    }

    @Suppress("DEPRECATION")
    private fun discoverServices(action: String, type: String): List<AndroidAiServiceCapability> {
        val packageManager = applicationContext.packageManager
        val intent = Intent(action)
        val matches = if (Build.VERSION.SDK_INT >= 33) {
            packageManager.queryIntentServices(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong()))
        } else {
            packageManager.queryIntentServices(intent, PackageManager.MATCH_ALL)
        }
        return matches.mapNotNull { match ->
            val service = match.serviceInfo ?: return@mapNotNull null
            AndroidAiServiceCapability(
                type = type,
                label = match.loadLabel(packageManager)?.toString()?.trim().orEmpty().ifBlank { service.packageName },
                packageName = service.packageName,
                serviceName = service.name,
            )
        }
    }

    companion object {
        private const val TEXT_CLASSIFIER_SERVICE = "android.service.textclassifier.TextClassifierService"
    }
}
