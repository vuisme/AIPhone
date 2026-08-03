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
    fun `clone-user launch remains root only`() {
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("LAUNCH_APP", 999))
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("CREATE_CLONE", 999))
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("DELETE_CLONE", 999))
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("CLEAR_CLONE", 999))
        assertEquals(NodeRequirement.ROOT, NodeCapabilityPolicy.requirement("FORCE_STOP_APP", 0))
    }

    @Test
    fun `image matching and capture can use accessibility without root`() {
        listOf("WAIT_IMAGE", "IF_IMAGE", "TAP_IMAGE", "CAPTURE").forEach { nodeType ->
            assertEquals(NodeRequirement.ACCESSIBILITY_OR_ROOT, NodeCapabilityPolicy.requirement(nodeType, 0))
            assertNull(NodeCapabilityPolicy.validate(nodeType, 0, hasRoot = false, hasAccessibility = true))
        }
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
