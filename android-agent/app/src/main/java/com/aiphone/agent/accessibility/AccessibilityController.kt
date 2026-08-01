package com.aiphone.agent.accessibility

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import com.aiphone.agent.root.RootGateway

object AccessibilityController {
    fun isReady(): Boolean = AIPhoneAccessibilityService.instance != null

    fun isEnabled(context: Context): Boolean {
        val expected = ComponentName(context, AIPhoneAccessibilityService::class.java)
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ).orEmpty().split(':').mapNotNull { ComponentName.unflattenFromString(it) }.any { it == expected }
    }

    fun ensureEnabled(context: Context): Boolean {
        if (isReady()) return true
        if (!isEnabled(context)) {
            if (!RootGateway.isRootGranted()) return false
            val component = ComponentName(context, AIPhoneAccessibilityService::class.java).flattenToString()
            val current = RootGateway.executeSafe(listOf("settings", "get", "secure", "enabled_accessibility_services"))
            check(current.isSuccess) { current.text.ifBlank { "Cannot read accessibility settings" } }
            val services = current.text.takeUnless { it == "null" }.orEmpty().split(':').filter { it.isNotBlank() }.toMutableSet()
            services += component
            val update = RootGateway.executeSafe(listOf("settings", "put", "secure", "enabled_accessibility_services", services.joinToString(":")))
            check(update.isSuccess) { update.text.ifBlank { "Cannot enable AIPhone accessibility service" } }
            val enabled = RootGateway.executeSafe(listOf("settings", "put", "secure", "accessibility_enabled", "1"))
            check(enabled.isSuccess) { enabled.text.ifBlank { "Cannot enable accessibility" } }
        }
        repeat(30) {
            if (isReady()) return true
            Thread.sleep(100)
        }
        return false
    }
}
