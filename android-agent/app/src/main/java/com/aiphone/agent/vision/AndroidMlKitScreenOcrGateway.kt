package com.aiphone.agent.vision

import android.graphics.BitmapFactory
import android.graphics.Rect
import android.os.SystemClock
import com.aiphone.agent.root.RootGateway
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class AndroidMlKitScreenOcrGateway : ScreenOcrGateway {
    override fun recognizeScreen(): ScreenOcrResult {
        val screenshotBytes = RootGateway.captureScreen()
        val bitmap = BitmapFactory.decodeByteArray(screenshotBytes, 0, screenshotBytes.size)
            ?: error("Cannot decode the captured screen for OCR")
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val result = AtomicReference<Text?>()
        val failure = AtomicReference<Exception?>()
        val completed = CountDownLatch(1)
        val startedAt = SystemClock.elapsedRealtime()

        try {
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener {
                    result.set(it)
                    completed.countDown()
                }
                .addOnFailureListener {
                    failure.set(it)
                    completed.countDown()
                }

            check(completed.await(OCR_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                "Google Play Services OCR timed out"
            }
            failure.get()?.let { cause ->
                val detail = cause.message?.takeIf(String::isNotBlank) ?: cause.javaClass.simpleName
                error("Google Play Services OCR failed: $detail")
            }
            val recognized = result.get() ?: error("Google Play Services OCR returned no result")
            return ScreenOcrResult(
                fullText = recognized.text,
                imageWidth = bitmap.width,
                imageHeight = bitmap.height,
                blocks = recognized.textBlocks.map(::toBlock),
                processingTimeMs = SystemClock.elapsedRealtime() - startedAt,
            )
        } finally {
            recognizer.close()
            bitmap.recycle()
        }
    }

    private fun toBlock(block: Text.TextBlock) = OcrTextBlock(
        text = block.text,
        bounds = block.boundingBox.toOcrBounds(),
        lines = block.lines.map { line ->
            OcrTextLine(
                text = line.text,
                bounds = line.boundingBox.toOcrBounds(),
            )
        },
    )

    private fun Rect?.toOcrBounds(): OcrBounds? = this?.let {
        OcrBounds(it.left, it.top, it.right, it.bottom)
    }

    companion object {
        private const val OCR_TIMEOUT_SECONDS = 30L
    }
}
