package com.aiphone.agent.workflow

import org.json.JSONArray
import org.json.JSONObject

data class TtsSpeakOptions(
    val text: String,
    val enginePackage: String?,
    val preferredVoice: String?,
    val languageTag: String,
    val speechRate: Float,
    val pitch: Float,
    val playAudio: Boolean,
    val saveAudio: Boolean,
    val outputVariable: String?,
) {
    companion object {
        fun fromConfig(config: JSONObject, context: RunContext): TtsSpeakOptions = fromValues(
            textTemplate = config.optString("text"),
            context = context,
            enginePackage = config.optString("engine"),
            preferredVoice = config.optString("voice"),
            languageTag = config.optString("languageTag", "vi-VN"),
            speechRate = config.optDouble("speechRate", 1.0).toFloat(),
            pitch = config.optDouble("pitch", 1.0).toFloat(),
            playAudio = config.optBoolean("playAudio", false),
            saveAudio = config.optBoolean("saveAudio", true),
            outputVariable = config.optString("outputVariable"),
        )

        fun fromValues(
            textTemplate: String,
            context: RunContext,
            enginePackage: String? = null,
            preferredVoice: String? = null,
            languageTag: String = "vi-VN",
            speechRate: Float = 1f,
            pitch: Float = 1f,
            playAudio: Boolean = false,
            saveAudio: Boolean = true,
            outputVariable: String? = null,
        ): TtsSpeakOptions {
            val text = context.interpolate(textTemplate)
            require(text.isNotBlank()) { "TTS text is required" }
            require(text.length <= MAX_TEXT_LENGTH) { "TTS text cannot exceed $MAX_TEXT_LENGTH characters" }
            val resolvedLanguageTag = languageTag.trim().ifBlank { "vi-VN" }
            require(LANGUAGE_TAG.matches(resolvedLanguageTag)) { "Invalid TTS language tag $resolvedLanguageTag" }
            val resolvedOutputVariable = outputVariable?.trim()?.ifBlank { null }
            if (resolvedOutputVariable != null) require(RunContext.isValidVariableName(resolvedOutputVariable)) {
                "Invalid variable name $resolvedOutputVariable"
            }
            return TtsSpeakOptions(
                text = text,
                enginePackage = enginePackage?.trim()?.ifBlank { null },
                preferredVoice = preferredVoice?.trim()?.ifBlank { null },
                languageTag = resolvedLanguageTag,
                speechRate = speechRate.coerceIn(0.25f, 4f),
                pitch = pitch.coerceIn(0.25f, 2f),
                playAudio = playAudio,
                saveAudio = saveAudio,
                outputVariable = resolvedOutputVariable,
            )
        }

        private val LANGUAGE_TAG = Regex("^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$")
        private const val MAX_TEXT_LENGTH = 5_000
    }
}

data class TtsVoiceDescriptor(
    val name: String,
    val languageTag: String,
    val quality: Int,
    val latency: Int,
    val requiresNetwork: Boolean,
    val features: Set<String> = emptySet(),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("name", name)
        .put("languageTag", languageTag)
        .put("quality", quality)
        .put("latency", latency)
        .put("requiresNetwork", requiresNetwork)
        .put("features", JSONArray(features.sorted()))
}

object TtsVoiceSelector {
    fun select(voices: Collection<TtsVoiceDescriptor>, languageTag: String, preferredVoice: String?): TtsVoiceDescriptor? {
        val requested = languageTag.lowercase()
        val language = requested.substringBefore('-')
        val compatible = voices.filter {
            val candidate = it.languageTag.lowercase()
            candidate == requested || candidate.substringBefore('-') == language
        }
        compatible.singleOrNull { it.name == preferredVoice }?.let { return it }
        return compatible.maxWithOrNull(
            compareBy<TtsVoiceDescriptor> { if (it.requiresNetwork) 0 else 1 }
                .thenBy { if (it.languageTag.equals(languageTag, ignoreCase = true)) 1 else 0 }
                .thenBy { it.quality }
                .thenByDescending { it.latency }
                .thenByDescending { it.name },
        )
    }
}

data class TtsEngineCapability(
    val packageName: String,
    val label: String,
    val voices: List<TtsVoiceDescriptor>,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("packageName", packageName)
        .put("label", label)
        .put("voices", JSONArray(voices.map { it.toJson() }))
}

data class TtsCapabilities(
    val available: Boolean,
    val defaultEngine: String?,
    val engines: List<TtsEngineCapability>,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("available", available)
        .put("defaultEngine", defaultEngine ?: JSONObject.NULL)
        .put("engines", JSONArray(engines.map { it.toJson() }))
}

data class TtsSynthesisResult(
    val enginePackage: String,
    val voiceName: String,
    val languageTag: String,
    val played: Boolean,
    val durationMs: Long,
)

interface TtsGateway {
    fun capabilities(): TtsCapabilities
    fun refreshCapabilities(): TtsCapabilities = capabilities()
    fun synthesize(options: TtsSpeakOptions, outputFile: java.io.File, isCancelled: () -> Boolean = { false }): TtsSynthesisResult
}

object TtsResultBinder {
    fun assign(context: RunContext, outputVariable: String?, result: Any) {
        if (outputVariable != null) context.set(outputVariable, RunValue(WorkflowValueType.JSON, result))
    }
}

object AudioArtifactId {
    private val PATTERN = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    fun isValid(value: String): Boolean = PATTERN.matches(value)
}
