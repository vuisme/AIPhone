package com.aiphone.agent.workflow

import com.aiphone.agent.accessibility.UiClickResult
import com.aiphone.agent.root.CommandResult

class TapTextRunner(
    private val click: () -> UiClickResult,
    private val tap: (Int, Int) -> CommandResult,
    private val delay: (Long) -> Unit,
    private val log: (String, String) -> Unit = { _, _ -> },
    private val isCancelled: () -> Boolean = { false },
) {
    fun run(timeoutMs: Long, pollIntervalMs: Long): String {
        val timeout = timeoutMs.coerceIn(100, 600_000)
        val interval = pollIntervalMs.coerceIn(100, 10_000)
        val deadline = System.currentTimeMillis() + timeout
        while (!isCancelled() && System.currentTimeMillis() < deadline) {
            val result = click()
            if (result.found) {
                if (result.actionClicked) {
                    log("INFO", "Đã bấm UI node bằng Accessibility: ${result.description}")
                    return "FOUND"
                }
                log("WARN", "UI node không hỗ trợ ACTION_CLICK; bấm bounds tại (${result.centerX}, ${result.centerY})")
                val tapResult = tap(result.centerX, result.centerY)
                check(tapResult.isSuccess) { tapResult.text.ifBlank { "Text bounds tap failed" } }
                return "FOUND"
            }
            delay(interval)
        }
        return "TIMEOUT"
    }
}
