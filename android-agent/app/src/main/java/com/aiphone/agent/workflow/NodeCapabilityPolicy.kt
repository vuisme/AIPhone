package com.aiphone.agent.workflow

enum class NodeRequirement { NONE, ACCESSIBILITY, ACCESSIBILITY_OR_ROOT, ROOT }

object NodeCapabilityPolicy {
    fun requirement(nodeType: String, androidUserId: Int = 0): NodeRequirement = when (nodeType) {
        "WAIT_IMAGE", "IF_IMAGE", "TAP_IMAGE", "CAPTURE",
        "TAP_POINT", "SWIPE" -> NodeRequirement.ACCESSIBILITY_OR_ROOT
        "CREATE_CLONE", "DELETE_CLONE", "CLEAR_CLONE", "FORCE_STOP_APP" -> NodeRequirement.ROOT
        "TAP_TEXT" -> NodeRequirement.ACCESSIBILITY
        "LAUNCH_APP" -> if (androidUserId == 0) NodeRequirement.NONE else NodeRequirement.ROOT
        else -> NodeRequirement.NONE
    }

    fun validate(nodeType: String, androidUserId: Int, hasRoot: Boolean, hasAccessibility: Boolean): String? = when (requirement(nodeType, androidUserId)) {
        NodeRequirement.NONE -> null
        NodeRequirement.ROOT -> if (hasRoot) null else "$nodeType yêu cầu quyền root"
        NodeRequirement.ACCESSIBILITY -> if (hasAccessibility) null else "$nodeType yêu cầu bật AIPhone UI Inspector trong Trợ năng"
        NodeRequirement.ACCESSIBILITY_OR_ROOT -> if (hasRoot || hasAccessibility) null else "$nodeType yêu cầu bật AIPhone UI Inspector trong Trợ năng"
    }
}
