package com.aiphone.agent.vision

import org.json.JSONArray
import org.json.JSONObject

data class OcrBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    fun toJson() = JSONObject()
        .put("left", left)
        .put("top", top)
        .put("right", right)
        .put("bottom", bottom)
}

data class OcrTextLine(
    val text: String,
    val bounds: OcrBounds?,
) {
    fun toJson() = JSONObject()
        .put("text", text)
        .put("bounds", bounds?.toJson() ?: JSONObject.NULL)
}

data class OcrTextBlock(
    val text: String,
    val bounds: OcrBounds?,
    val lines: List<OcrTextLine>,
) {
    fun toJson() = JSONObject()
        .put("text", text)
        .put("bounds", bounds?.toJson() ?: JSONObject.NULL)
        .put("lines", JSONArray(lines.map(OcrTextLine::toJson)))
}

data class ScreenOcrResult(
    val fullText: String,
    val imageWidth: Int,
    val imageHeight: Int,
    val blocks: List<OcrTextBlock>,
    val processingTimeMs: Long,
) {
    fun toJson() = JSONObject()
        .put("engine", ENGINE)
        .put("script", "LATIN")
        .put("fullText", fullText)
        .put("image", JSONObject().put("width", imageWidth).put("height", imageHeight))
        .put("blocks", JSONArray(blocks.map(OcrTextBlock::toJson)))
        .put("processingTimeMs", processingTimeMs)

    companion object {
        const val ENGINE = "GOOGLE_PLAY_SERVICES_MLKIT_TEXT_RECOGNITION_V2"
    }
}

interface ScreenOcrGateway {
    fun recognizeScreen(): ScreenOcrResult
}
