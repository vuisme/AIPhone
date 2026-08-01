package com.aiphone.agent.accessibility

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UiSelectorMatcherTest {
    private val skipButton = UiNodeDescriptor(
        text = "Đ.KÝ SAU",
        contentDescription = "",
        resourceId = "register-later",
        className = "android.widget.Button",
        packageName = "com.garena.game.kgvn",
        clickable = true,
        bounds = UiBounds(1800, 200, 1980, 280),
    )

    @Test
    fun `matches exact WebView text with supporting resource fields`() {
        val selector = UiSelectorSpec(
            text = "Đ.KÝ SAU",
            resourceId = "register-later",
            className = "android.widget.Button",
            matchMode = SelectorMatchMode.EXACT,
        )

        assertEquals(110, UiSelectorMatcher.score(skipButton, selector))
    }

    @Test
    fun `supports contains matching for changing labels`() {
        val selector = UiSelectorSpec(text = "Đ.KÝ", matchMode = SelectorMatchMode.CONTAINS)

        assertEquals(60, UiSelectorMatcher.score(skipButton, selector))
    }

    @Test
    fun `rejects nodes when any populated selector field conflicts`() {
        val selector = UiSelectorSpec(text = "Có", className = "android.widget.Button")

        assertNull(UiSelectorMatcher.score(skipButton, selector))
    }

    @Test
    fun `prefers the duplicate label closest to the captured bounds`() {
        val selector = UiSelectorSpec(text = "Đ.KÝ SAU", bounds = UiBounds(1800, 200, 1980, 280))
        val farButton = skipButton.copy(bounds = UiBounds(200, 200, 380, 280))

        val nearScore = UiSelectorMatcher.score(skipButton, selector)!!
        val farScore = UiSelectorMatcher.score(farButton, selector)!!

        assertTrue(nearScore > farScore)
    }
}
