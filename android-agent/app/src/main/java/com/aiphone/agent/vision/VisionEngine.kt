package com.aiphone.agent.vision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

data class NormalizedRegion(val x: Double, val y: Double, val width: Double, val height: Double)

object VisionEngine {
    fun find(
        screenshotPng: ByteArray,
        templateFile: File,
        threshold: Double,
        region: NormalizedRegion? = null,
    ): Match? {
        val screenshot = BitmapFactory.decodeByteArray(screenshotPng, 0, screenshotPng.size)
            ?: error("Cannot decode screenshot")
        val template = BitmapFactory.decodeFile(templateFile.absolutePath)
            ?: error("Cannot decode template ${templateFile.name}")
        return try {
            val sourceImage = screenshot.toIntImage()
            val templateImage = template.toIntImage()
            val bounds = region?.toBounds(screenshot.width, screenshot.height)
                ?: SearchBounds(0, 0, screenshot.width, screenshot.height)
            val stride = maxOf(1, minOf(template.width, template.height) / 12)
            PixelMatcher.find(sourceImage, templateImage, threshold, stride, bounds)
        } finally {
            screenshot.recycle()
            template.recycle()
        }
    }

    private fun Bitmap.toIntImage(): IntImage {
        val values = IntArray(width * height)
        getPixels(values, 0, width, 0, 0, width, height)
        return IntImage(width, height, values)
    }

    private fun NormalizedRegion.toBounds(screenWidth: Int, screenHeight: Int): SearchBounds {
        val left = (x.coerceIn(0.0, 1.0) * screenWidth).toInt()
        val top = (y.coerceIn(0.0, 1.0) * screenHeight).toInt()
        val right = ((x + width).coerceIn(0.0, 1.0) * screenWidth).toInt()
        val bottom = ((y + height).coerceIn(0.0, 1.0) * screenHeight).toInt()
        return SearchBounds(left, top, right, bottom)
    }
}

