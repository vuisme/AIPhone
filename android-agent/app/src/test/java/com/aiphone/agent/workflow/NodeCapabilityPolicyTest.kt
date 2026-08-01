package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NodeCapabilityPolicyTest {
    @Test
    fun `main-user launch works without root`() {
        assertNull(NodeCapabilityPolicy.validate("LAUNCH_APP", 0, hasRoot = false, hasAccessibility = false))
    }

    @Test
    fun `clone-user launch and image matching require root`() {
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("LAUNCH_APP", 999))
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("TAP_IMAGE", 0))
    }

    @Test
    fun `coordinate input can use accessibility without root`() {
        assertNull(NodeCapabilityPolicy.validate("SWIPE", 0, hasRoot = false, hasAccessibility = true))
        assertEquals(
            "TAP_POINT yêu cầu bật AIPhone UI Inspector trong Trợ năng",
            NodeCapabilityPolicy.validate("TAP_POINT", 0, hasRoot = false, hasAccessibility = false),
        )
    }

    @Test
    fun `text matching still requires accessibility on rooted devices`() {
        assertEquals(
            "TAP_TEXT yêu cầu bật AIPhone UI Inspector trong Trợ năng",
            NodeCapabilityPolicy.validate("TAP_TEXT", 0, hasRoot = true, hasAccessibility = false),
        )
        assertNull(NodeCapabilityPolicy.validate("TAP_TEXT", 0, hasRoot = true, hasAccessibility = true))
    }
}
