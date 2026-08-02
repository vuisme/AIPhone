package com.aiphone.agent

enum class ConnectionMode {
    CLOUD,
    ADB;

    companion object {
        fun fromStorage(value: String?, legacyCallbackEnabled: Boolean): ConnectionMode {
            if (value == null) return if (legacyCallbackEnabled) CLOUD else ADB
            return entries.firstOrNull { it.name == value } ?: ADB
        }
    }
}
