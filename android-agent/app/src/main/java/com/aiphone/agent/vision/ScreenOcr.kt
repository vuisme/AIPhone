package com.aiphone.agent.vision

import org.json.JSONObject

data class OcrBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    fun toMap(): Map<String, Int> = mapOf(
        "left" to left,
        "top" to top,
        "right" to right,
        "bottom" to bottom,
    )
}

data class OcrTextLine(
    val text: String,
    val bounds: OcrBounds?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "text" to text,
        "bounds" to bounds?.toMap(),
    )
}

data class OcrTextBlock(
    val text: String,
    val bounds: OcrBounds?,
    val lines: List<OcrTextLine>,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "text" to text,
        "bounds" to bounds?.toMap(),
        "lines" to lines.map(OcrTextLine::toMap),
    )
}

data class ScreenOcrResult(
    val fullText: String,
    val imageWidth: Int,
    val imageHeight: Int,
    val blocks: List<OcrTextBlock>,
    val processingTimeMs: Long,
) {
    fun toMap(): Map<String, Any> = mapOf(
        "engine" to ENGINE,
        "script" to "LATIN",
        "fullText" to fullText,
        "image" to mapOf("width" to imageWidth, "height" to imageHeight),
        "blocks" to blocks.map(OcrTextBlock::toMap),
        "processingTimeMs" to processingTimeMs,
    )

    fun toJson() = JSONObject(toMap())

    companion object {
        const val ENGINE = "GOOGLE_PLAY_SERVICES_MLKIT_TEXT_RECOGNITION_V2"
    }
}

interface ScreenOcrGateway {
    fun recognizeScreen(): ScreenOcrResult
}
