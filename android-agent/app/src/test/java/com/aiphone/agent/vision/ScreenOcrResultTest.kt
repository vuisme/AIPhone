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

        val contract = result.toMap()
        val image = contract.getValue("image") as Map<*, *>
        val blocks = contract.getValue("blocks") as List<*>
        val firstBlock = blocks.first() as Map<*, *>
        val bounds = firstBlock["bounds"] as Map<*, *>
        val lines = firstBlock["lines"] as List<*>
        val secondLine = lines[1] as Map<*, *>

        assertEquals("GOOGLE_PLAY_SERVICES_MLKIT_TEXT_RECOGNITION_V2", contract["engine"])
        assertEquals("Minh Nguyen\nBai viet rat hay", contract["fullText"])
        assertEquals(1080, image["width"])
        assertEquals(320, bounds["top"])
        assertEquals("Bai viet rat hay", secondLine["text"])
        assertTrue(contract.getValue("processingTimeMs") as Long > 0)
    }
}
