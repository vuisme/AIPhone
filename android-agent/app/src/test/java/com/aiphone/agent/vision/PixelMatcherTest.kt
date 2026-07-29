package com.aiphone.agent.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PixelMatcherTest {
    @Test
    fun `finds a template inside a larger image`() {
        val source = IntImage(4, 3, intArrayOf(
            0, 0, 0, 0,
            0, 10, 20, 0,
            0, 30, 40, 0,
        ))
        val template = IntImage(2, 2, intArrayOf(10, 20, 30, 40))

        assertEquals(Match(1, 1, 2, 2, 1.0), PixelMatcher.find(source, template, 0.99, 1))
    }

    @Test
    fun `returns null when confidence is below threshold`() {
        val source = IntImage(2, 2, intArrayOf(10, 10, 10, 10))
        val template = IntImage(2, 2, intArrayOf(200, 200, 200, 200))

        assertNull(PixelMatcher.find(source, template, 0.9, 1))
    }
}
