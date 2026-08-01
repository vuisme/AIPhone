package com.aiphone.agent.root

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PrimaryDisplaySelectorTest {
    @Test
    fun `selects the built in HWC display instead of an auxiliary display`() {
        val output = """
            Display 4630946457447247251 (HWC display 0): port=147 pnpId=QCM displayName=""
            Display 4630946457447247252 (HWC display 5): port=148 pnpId=QCM displayName=""
        """.trimIndent()

        assertEquals("4630946457447247251", PrimaryDisplaySelector.fromSurfaceFlinger(output))
    }

    @Test
    fun `returns null when the primary physical display cannot be identified`() {
        assertNull(PrimaryDisplaySelector.fromSurfaceFlinger("No displays found"))
    }
}
