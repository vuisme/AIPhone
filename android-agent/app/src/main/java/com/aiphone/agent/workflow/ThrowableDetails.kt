package com.aiphone.agent.workflow

internal fun describeThrowable(error: Throwable): String {
    val details = mutableListOf(error.message?.takeIf(String::isNotBlank) ?: error.javaClass.simpleName)
    var cause = error.cause
    var depth = 0
    while (cause != null && cause !== error && depth++ < 4) {
        val label = cause.javaClass.simpleName
        val message = cause.message?.takeIf(String::isNotBlank)?.replace('\n', ' ')?.replace('\r', ' ')
        details += if (message == null) label else "$label: $message"
        cause = cause.cause
    }
    return details.joinToString(" <- ")
}
