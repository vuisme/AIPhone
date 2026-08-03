package com.aiphone.agent.vision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import kotlin.math.roundToInt

data class ImageSize(val width: Int, val height: Int)
data class NormalizedRect(val x: Double, val y: Double, val width: Double, val height: Double)
data class PixelRect(val x: Int, val y: Int, val width: Int, val height: Int)

data class CapturePreviewImage(
    val sourceSize: ImageSize,
    val previewSize: ImageSize,
    val mimeType: String,
    val bytes: ByteArray,
)

data class CapturePreview(
    val captureId: String,
    val sourceSize: ImageSize,
    val previewSize: ImageSize,
    val mimeType: String,
    val bytes: ByteArray,
    val expiresAt: Long,
)

interface CaptureImageCodec {
    fun preview(sourcePng: ByteArray, maxWidth: Int, quality: Int): CapturePreviewImage
    fun cropPng(sourcePng: ByteArray, rect: PixelRect): ByteArray
}

fun normalizedToPixelRect(rect: NormalizedRect, source: ImageSize): PixelRect {
    require(source.width > 0 && source.height > 0) { "Screenshot dimensions are invalid" }
    require(listOf(rect.x, rect.y, rect.width, rect.height).all { it.isFinite() }) { "Crop coordinates must be finite" }
    require(rect.x >= 0.0 && rect.y >= 0.0 && rect.width > 0.0 && rect.height > 0.0) { "Crop coordinates are invalid" }
    require(rect.x <= 1.0 && rect.y <= 1.0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001) {
        "Crop exceeds screenshot bounds"
    }

    val x = (rect.x * source.width).roundToInt().coerceIn(0, source.width - 1)
    val y = (rect.y * source.height).roundToInt().coerceIn(0, source.height - 1)
    val width = (rect.width * source.width).roundToInt().coerceIn(1, source.width - x)
    val height = (rect.height * source.height).roundToInt().coerceIn(1, source.height - y)
    return PixelRect(x, y, width, height)
}

class CaptureSessionStore(
    private val directory: File,
    private val captureScreen: () -> ByteArray,
    private val codec: CaptureImageCodec = AndroidCaptureImageCodec(),
    private val now: () -> Long = System::currentTimeMillis,
    private val idFactory: () -> String = { UUID.randomUUID().toString() },
    private val ttlMs: Long = DEFAULT_TTL_MS,
    private val maxSessions: Int = DEFAULT_MAX_SESSIONS,
) {
    private data class Session(val sourceSize: ImageSize, val expiresAt: Long, val file: File)

    private val sessions = linkedMapOf<String, Session>()

    init {
        require(ttlMs > 0) { "Capture TTL must be positive" }
        require(maxSessions > 0) { "Capture cache size must be positive" }
        directory.mkdirs()
        directory.listFiles { file -> file.isFile && file.extension == "png" }.orEmpty().forEach(File::delete)
    }

    @Synchronized
    fun capturePreview(): CapturePreview {
        cleanupExpired()
        val sourcePng = captureScreen()
        require(sourcePng.isNotEmpty()) { "Screenshot is empty" }
        val preview = codec.preview(sourcePng, PREVIEW_MAX_WIDTH, PREVIEW_QUALITY)
        val captureId = idFactory()
        require(CAPTURE_ID.matches(captureId)) { "Capture ID is invalid" }
        val file = File(directory, "$captureId.png")
        file.writeBytes(sourcePng)
        val expiresAt = now() + ttlMs
        sessions[captureId] = Session(preview.sourceSize, expiresAt, file)
        trimToLimit()
        return CapturePreview(captureId, preview.sourceSize, preview.previewSize, preview.mimeType, preview.bytes, expiresAt)
    }

    @Synchronized
    fun crop(captureId: String, rect: NormalizedRect): ByteArray {
        require(CAPTURE_ID.matches(captureId)) { "Capture ID is invalid" }
        cleanupExpired()
        val session = sessions[captureId]?.takeIf { it.file.isFile }
            ?: throw NoSuchElementException("Capture is missing or expired; take a new screenshot")
        val sourcePng = session.file.readBytes()
        return codec.cropPng(sourcePng, normalizedToPixelRect(rect, session.sourceSize))
    }

    private fun cleanupExpired() {
        val timestamp = now()
        val expired = sessions.filterValues { it.expiresAt <= timestamp || !it.file.isFile }.keys
        expired.forEach { remove(it) }
    }

    private fun trimToLimit() {
        while (sessions.size > maxSessions) remove(sessions.keys.first())
    }

    private fun remove(captureId: String) {
        sessions.remove(captureId)?.file?.delete()
    }

    companion object {
        private val CAPTURE_ID = Regex("[0-9a-f-]{36}")
        private const val PREVIEW_MAX_WIDTH = 1280
        private const val PREVIEW_QUALITY = 70
        private const val DEFAULT_TTL_MS = 60_000L
        private const val DEFAULT_MAX_SESSIONS = 3
    }
}

class AndroidCaptureImageCodec : CaptureImageCodec {
    override fun preview(sourcePng: ByteArray, maxWidth: Int, quality: Int): CapturePreviewImage {
        val source = BitmapFactory.decodeByteArray(sourcePng, 0, sourcePng.size) ?: error("Cannot decode screenshot")
        try {
            val previewWidth = minOf(source.width, maxWidth)
            val previewHeight = maxOf(1, (source.height.toDouble() * previewWidth / source.width).roundToInt())
            val preview = if (previewWidth == source.width && previewHeight == source.height) source
            else Bitmap.createScaledBitmap(source, previewWidth, previewHeight, true)
            try {
                val bytes = ByteArrayOutputStream().use { output ->
                    check(preview.compress(Bitmap.CompressFormat.WEBP_LOSSY, quality, output)) { "Cannot encode screenshot preview" }
                    output.toByteArray()
                }
                return CapturePreviewImage(
                    sourceSize = ImageSize(source.width, source.height),
                    previewSize = ImageSize(preview.width, preview.height),
                    mimeType = "image/webp",
                    bytes = bytes,
                )
            } finally {
                if (preview !== source) preview.recycle()
            }
        } finally {
            source.recycle()
        }
    }

    override fun cropPng(sourcePng: ByteArray, rect: PixelRect): ByteArray {
        val source = BitmapFactory.decodeByteArray(sourcePng, 0, sourcePng.size) ?: error("Cannot decode cached screenshot")
        try {
            val crop = Bitmap.createBitmap(source, rect.x, rect.y, rect.width, rect.height)
            try {
                return ByteArrayOutputStream().use { output ->
                    check(crop.compress(Bitmap.CompressFormat.PNG, 100, output)) { "Cannot encode screenshot crop" }
                    output.toByteArray()
                }
            } finally {
                if (crop !== source) crop.recycle()
            }
        } finally {
            source.recycle()
        }
    }
}
