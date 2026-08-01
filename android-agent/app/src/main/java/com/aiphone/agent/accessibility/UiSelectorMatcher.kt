package com.aiphone.agent.accessibility

enum class SelectorMatchMode { EXACT, CONTAINS }

data class UiSelectorSpec(
    val text: String? = null,
    val contentDescription: String? = null,
    val resourceId: String? = null,
    val className: String? = null,
    val packageName: String? = null,
    val bounds: UiBounds? = null,
    val matchMode: SelectorMatchMode = SelectorMatchMode.EXACT,
)

data class UiBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val centerX: Int get() = (left + right) / 2
    val centerY: Int get() = (top + bottom) / 2
}

data class UiNodeDescriptor(
    val text: String,
    val contentDescription: String,
    val resourceId: String,
    val className: String,
    val packageName: String,
    val clickable: Boolean,
    val bounds: UiBounds? = null,
)

object UiSelectorMatcher {
    fun score(node: UiNodeDescriptor, selector: UiSelectorSpec): Int? {
        var score = if (node.clickable) 5 else 0
        val hasField = !selector.text.isNullOrBlank() || !selector.contentDescription.isNullOrBlank() ||
            !selector.resourceId.isNullOrBlank() || !selector.className.isNullOrBlank() || !selector.packageName.isNullOrBlank()
        if (!hasField) return null

        selector.text?.takeIf { it.isNotBlank() }?.let {
            if (!matches(node.text, it, selector.matchMode)) return null
            score += if (selector.matchMode == SelectorMatchMode.EXACT) 60 else 55
        }
        selector.contentDescription?.takeIf { it.isNotBlank() }?.let {
            if (!matches(node.contentDescription, it, selector.matchMode)) return null
            score += 45
        }
        selector.resourceId?.takeIf { it.isNotBlank() }?.let {
            if (node.resourceId != it) return null
            score += 30
        }
        selector.className?.takeIf { it.isNotBlank() }?.let {
            if (node.className != it) return null
            score += 15
        }
        selector.packageName?.takeIf { it.isNotBlank() }?.let {
            if (node.packageName != it) return null
            score += 10
        }
        selector.bounds?.let { preferred ->
            node.bounds?.let { actual ->
                val distance = kotlin.math.abs(actual.centerX - preferred.centerX) + kotlin.math.abs(actual.centerY - preferred.centerY)
                score += if (distance == 0) 20 else -(distance / 100).coerceAtMost(20)
            }
        }
        return score
    }

    private fun matches(actual: String, expected: String, mode: SelectorMatchMode): Boolean = when (mode) {
        SelectorMatchMode.EXACT -> actual == expected
        SelectorMatchMode.CONTAINS -> actual.contains(expected, ignoreCase = true)
    }
}
