package com.aiphone.agent.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class UiClickResult(
    val found: Boolean,
    val actionClicked: Boolean = false,
    val centerX: Int = 0,
    val centerY: Int = 0,
    val description: String = "",
)

class AIPhoneAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    @Synchronized
    fun hierarchyJson(): JSONObject {
        val root = rootInActiveWindow ?: error("Accessibility hierarchy is unavailable")
        val nodes = JSONArray()
        val xml = StringBuilder("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<hierarchy>")
        var nextId = 0

        fun visit(node: AccessibilityNodeInfo, parentId: Int?) {
            if (nextId >= MAX_NODES) return
            val id = nextId++
            val bounds = Rect().also(node::getBoundsInScreen)
            val text = node.text?.toString().orEmpty()
            val description = node.contentDescription?.toString().orEmpty()
            val resourceId = node.viewIdResourceName.orEmpty()
            val className = node.className?.toString().orEmpty()
            val packageName = node.packageName?.toString().orEmpty()
            nodes.put(JSONObject().apply {
                put("id", id)
                put("parentId", parentId ?: JSONObject.NULL)
                put("text", text)
                put("contentDescription", description)
                put("resourceId", resourceId)
                put("className", className)
                put("packageName", packageName)
                put("clickable", node.isClickable)
                put("enabled", node.isEnabled)
                put("visible", node.isVisibleToUser)
                put("bounds", JSONObject().put("left", bounds.left).put("top", bounds.top).put("right", bounds.right).put("bottom", bounds.bottom))
            })
            xml.append("\n  <node id=\"").append(id).append("\" parent-id=\"").append(parentId ?: -1)
                .append("\" text=\"").append(xmlEscape(text)).append("\" content-desc=\"").append(xmlEscape(description))
                .append("\" resource-id=\"").append(xmlEscape(resourceId)).append("\" class=\"").append(xmlEscape(className))
                .append("\" package=\"").append(xmlEscape(packageName)).append("\" clickable=\"").append(node.isClickable)
                .append("\" enabled=\"").append(node.isEnabled).append("\" bounds=\"[").append(bounds.left).append(',').append(bounds.top)
                .append("][").append(bounds.right).append(',').append(bounds.bottom).append("]\" />")
            for (index in 0 until node.childCount) node.getChild(index)?.let { visit(it, id) }
        }

        visit(root, null)
        xml.append("\n</hierarchy>")
        return JSONObject().apply {
            put("capturedAt", Instant.now().toString())
            put("packageName", root.packageName?.toString().orEmpty())
            put("nodes", nodes)
            put("xml", xml.toString())
            put("surfaceOnly", nodes.length() <= 8 && (0 until nodes.length()).any { nodes.getJSONObject(it).getString("className").endsWith("SurfaceView") })
        }
    }

    @Synchronized
    fun click(selector: UiSelectorSpec): UiClickResult {
        val root = rootInActiveWindow ?: return UiClickResult(found = false)
        var bestNode: AccessibilityNodeInfo? = null
        var bestScore = Int.MIN_VALUE

        fun visit(node: AccessibilityNodeInfo) {
            val descriptor = node.toDescriptor()
            val score = UiSelectorMatcher.score(descriptor, selector)
            val bounds = descriptor.bounds
            if (score != null && score > bestScore && node.isEnabled && node.isVisibleToUser && bounds != null && bounds.right > bounds.left && bounds.bottom > bounds.top) {
                bestScore = score
                bestNode = node
            }
            for (index in 0 until node.childCount) node.getChild(index)?.let(::visit)
        }
        visit(root)
        val matched = bestNode ?: return UiClickResult(found = false)
        val bounds = Rect().also(matched::getBoundsInScreen)
        var clickable: AccessibilityNodeInfo? = matched
        while (clickable != null) {
            if (clickable.isClickable && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return UiClickResult(true, true, bounds.centerX(), bounds.centerY(), matched.toDescriptor().label())
            }
            clickable = clickable.parent
        }
        return UiClickResult(true, false, bounds.centerX(), bounds.centerY(), matched.toDescriptor().label())
    }

    private fun AccessibilityNodeInfo.toDescriptor() = UiNodeDescriptor(
        text = text?.toString().orEmpty(),
        contentDescription = contentDescription?.toString().orEmpty(),
        resourceId = viewIdResourceName.orEmpty(),
        className = className?.toString().orEmpty(),
        packageName = packageName?.toString().orEmpty(),
        clickable = isClickable,
        bounds = Rect().also { getBoundsInScreen(it) }.let { UiBounds(it.left, it.top, it.right, it.bottom) },
    )

    private fun UiNodeDescriptor.label(): String = text.ifBlank { contentDescription.ifBlank { resourceId.ifBlank { className } } }

    private fun xmlEscape(value: String): String = value
        .replace("&", "&amp;")
        .replace("\"", "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")

    companion object {
        @Volatile var instance: AIPhoneAccessibilityService? = null
            private set
        private const val MAX_NODES = 5_000
    }
}
