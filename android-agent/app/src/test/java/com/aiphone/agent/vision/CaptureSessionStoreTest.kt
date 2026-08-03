package com.aiphone.agent.vision

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import java.nio.file.Files

class CaptureSessionStoreTest {
    @Test
    fun `normalized crop maps to the original screenshot pixels`() {
        assertEquals(
            PixelRect(x = 261, y = 120, width = 782, height = 480),
            normalizedToPixelRect(
                NormalizedRect(x = 0.1, y = 0.1, width = 0.3, height = 0.4),
                ImageSize(width = 2608, height = 1200),
            ),
        )
    }

    @Test
    fun `capture cache keeps bounded originals and returns a lossless crop`() {
        val directory = Files.createTempDirectory("aiphone-captures").toFile()
        var nextId = 0
        val store = CaptureSessionStore(
            directory = directory,
            captureScreen = {
                nextId += 1
                byteArrayOf(nextId.toByte())
            },
            codec = FakeCaptureImageCodec(),
            now = { 1_000L },
            idFactory = { "00000000-0000-0000-0000-00000000000$nextId" },
            maxSessions = 2,
        )

        val first = store.capturePreview()
        store.capturePreview()
        val latest = store.capturePreview()

        assertFalse(directory.resolve("${first.captureId}.png").exists())
        assertArrayEquals("3:10,20,30,40".toByteArray(), store.crop(latest.captureId, NormalizedRect(0.1, 0.2, 0.3, 0.4)))
    }

    @Test
    fun `expired captures cannot be cropped`() {
        val directory = Files.createTempDirectory("aiphone-captures").toFile()
        var now = 1_000L
        val store = CaptureSessionStore(
            directory = directory,
            captureScreen = { byteArrayOf(1) },
            codec = FakeCaptureImageCodec(),
            now = { now },
            idFactory = { "00000000-0000-0000-0000-000000000001" },
            ttlMs = 60_000L,
        )
        val capture = store.capturePreview()

        now += 60_001L

        assertThrows(NoSuchElementException::class.java) {
            store.crop(capture.captureId, NormalizedRect(0.1, 0.1, 0.2, 0.2))
        }
    }
}

private class FakeCaptureImageCodec : CaptureImageCodec {
    override fun preview(sourcePng: ByteArray, maxWidth: Int, quality: Int): CapturePreviewImage = CapturePreviewImage(
        sourceSize = ImageSize(100, 100),
        previewSize = ImageSize(100, 100),
        mimeType = "image/webp",
        bytes = "preview:${sourcePng[0]}".toByteArray(),
    )

    override fun cropPng(sourcePng: ByteArray, rect: PixelRect): ByteArray =
        "${sourcePng[0]}:${rect.x},${rect.y},${rect.width},${rect.height}".toByteArray()
}
