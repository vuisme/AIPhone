package com.aiphone.agent.workflow

import com.aiphone.agent.root.CommandResult
import com.aiphone.agent.vision.Match
import java.util.Locale

data class TapImageOptions(
    val offsetX: Int = 0,
    val offsetY: Int = 0,
    val maxAttempts: Int = 2,
    val verificationDelayMs: Long = 700,
    val verifyAfterTap: Boolean = true,
) {
    init {
        require(maxAttempts in 1..5)
        require(verificationDelayMs in 100..5_000)
    }
}

class TapImageRunner(
    private val findImage: () -> Match?,
    private val tap: (Int, Int) -> CommandResult,
    private val delay: (Long) -> Unit,
    private val log: (String, String) -> Unit = { _, _ -> },
    private val isCancelled: () -> Boolean = { false },
) {
    fun run(options: TapImageOptions): String {
        if (isCancelled()) return "TIMEOUT"
        var match = findImage() ?: return "TIMEOUT"
        var lastX = 0
        var lastY = 0

        repeat(options.maxAttempts) { attemptIndex ->
            if (isCancelled()) return "TIMEOUT"
            lastX = match.x + match.width / 2 + options.offsetX
            lastY = match.y + match.height / 2 + options.offsetY
            val attempt = attemptIndex + 1
            log(
                "INFO",
                "Khớp ảnh [${match.x}, ${match.y}, ${match.width}x${match.height}], " +
                    "confidence=${String.format(Locale.US, "%.3f", match.confidence)}; " +
                    "bấm ($lastX, $lastY), lần $attempt/${options.maxAttempts}",
            )

            val result = tap(lastX, lastY)
            if (result.text.isNotBlank()) log(if (result.isSuccess) "INFO" else "ERROR", result.text)
            check(result.isSuccess) { result.text.ifBlank { "Tap failed at ($lastX, $lastY)" } }
            if (!options.verifyAfterTap) return "FOUND"

            delay(options.verificationDelayMs)
            if (isCancelled()) return "TIMEOUT"
            val remaining = findImage()
            if (remaining == null) {
                log("INFO", "Đã xác nhận ảnh biến mất sau khi bấm")
                return "FOUND"
            }
            match = remaining
            if (attempt < options.maxAttempts) {
                log("WARN", "Ảnh vẫn còn sau ${options.verificationDelayMs} ms; sẽ bấm lại")
            }
        }

        error("Tap chưa được xác nhận: ảnh vẫn còn sau ${options.maxAttempts} lần bấm (lần cuối tại $lastX, $lastY)")
    }
}
