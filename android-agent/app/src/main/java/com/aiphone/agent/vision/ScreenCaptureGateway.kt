package com.aiphone.agent.vision

class ScreenCaptureGateway(
    private val rootCapture: () -> ByteArray,
    private val accessibilityCapture: () -> ByteArray,
) {
    fun captureScreen(): ByteArray {
        val rootResult = runCatching(rootCapture)
        rootResult.getOrNull()?.takeIf(ByteArray::isNotEmpty)?.let { return it }

        val accessibilityResult = runCatching(accessibilityCapture)
        accessibilityResult.getOrNull()?.takeIf(ByteArray::isNotEmpty)?.let { return it }

        val rootError = rootResult.exceptionOrNull().detail("empty screenshot")
        val accessibilityError = accessibilityResult.exceptionOrNull().detail("empty screenshot")
        error("Screenshot unavailable. Root capture failed: $rootError. Accessibility capture failed: $accessibilityError")
    }

    private fun Throwable?.detail(fallback: String): String = this?.message
        ?.takeIf(String::isNotBlank)
        ?: this?.javaClass?.simpleName
        ?: fallback
}
