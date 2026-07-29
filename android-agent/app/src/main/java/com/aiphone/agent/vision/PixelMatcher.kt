package com.aiphone.agent.vision

import kotlin.math.min

data class IntImage(val width: Int, val height: Int, val pixels: IntArray) {
    init {
        require(width > 0 && height > 0)
        require(pixels.size == width * height)
    }

    operator fun get(x: Int, y: Int): Int = pixels[y * width + x]
}

data class Match(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val confidence: Double,
)

data class SearchBounds(val left: Int, val top: Int, val right: Int, val bottom: Int)

object PixelMatcher {
    fun find(
        source: IntImage,
        template: IntImage,
        threshold: Double,
        stride: Int,
        bounds: SearchBounds = SearchBounds(0, 0, source.width, source.height),
    ): Match? {
        require(threshold in 0.0..1.0)
        require(stride > 0)
        if (template.width > source.width || template.height > source.height) return null

        val left = bounds.left.coerceIn(0, source.width - template.width)
        val top = bounds.top.coerceIn(0, source.height - template.height)
        val maxX = (bounds.right - template.width).coerceIn(left, source.width - template.width)
        val maxY = (bounds.bottom - template.height).coerceIn(top, source.height - template.height)
        val sampleStep = maxOf(1, min(template.width, template.height) / 24)
        var best: Match? = null

        var y = top
        while (y <= maxY) {
            var x = left
            while (x <= maxX) {
                val confidence = confidenceAt(source, template, x, y, sampleStep)
                if (confidence >= threshold && (best == null || confidence > best.confidence)) {
                    best = Match(x, y, template.width, template.height, confidence)
                    if (confidence >= 0.9999) return best
                }
                x += stride
            }
            y += stride
        }
        return best
    }

    private fun confidenceAt(source: IntImage, template: IntImage, offsetX: Int, offsetY: Int, step: Int): Double {
        var difference = 0L
        var samples = 0L
        var y = 0
        while (y < template.height) {
            var x = 0
            while (x < template.width) {
                val sourcePixel = source[offsetX + x, offsetY + y]
                val templatePixel = template[x, y]
                difference += channelDifference(sourcePixel, templatePixel)
                samples++
                x += step
            }
            y += step
        }
        return 1.0 - difference.toDouble() / (samples * 3.0 * 255.0)
    }

    private fun channelDifference(first: Int, second: Int): Int {
        val red = kotlin.math.abs(((first shr 16) and 0xff) - ((second shr 16) and 0xff))
        val green = kotlin.math.abs(((first shr 8) and 0xff) - ((second shr 8) and 0xff))
        val blue = kotlin.math.abs((first and 0xff) - (second and 0xff))
        return red + green + blue
    }
}
