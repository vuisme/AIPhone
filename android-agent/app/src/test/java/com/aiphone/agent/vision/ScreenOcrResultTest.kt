package com.aiphone.agent.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenOcrResultTest {
    @Test
    fun `serializes recognized text with screen coordinates`() {
        val result = ScreenOcrResult(
            fullText = "Minh Nguyen\nBai viet rat hay",
            imageWidth = 1080,
            imageHeight = 2400,
            blocks = listOf(
                OcrTextBlock(
                    text = "Minh Nguyen\nBai viet rat hay",
                    bounds = OcrBounds(80, 320, 970, 520),
                    lines = listOf(
                        OcrTextLine("Minh Nguyen", OcrBounds(80, 320, 410, 370)),
                        OcrTextLine("Bai viet rat hay", OcrBounds(80, 390, 970, 450)),
                    ),
                ),
            ),
            processingTimeMs = 142,
        )

        val json = result.toJson()

        assertEquals("GOOGLE_PLAY_SERVICES_MLKIT_TEXT_RECOGNITION_V2", json.getString("engine"))
        assertEquals("Minh Nguyen\nBai viet rat hay", json.getString("fullText"))
        assertEquals(1080, json.getJSONObject("image").getInt("width"))
        assertEquals(320, json.getJSONArray("blocks").getJSONObject(0).getJSONObject("bounds").getInt("top"))
        assertEquals("Bai viet rat hay", json.getJSONArray("blocks").getJSONObject(0).getJSONArray("lines").getJSONObject(1).getString("text"))
        assertTrue(json.getLong("processingTimeMs") > 0)
    }
}
