package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Test

class ThrowableDetailsTest {
    @Test
    fun `preserves a useful top-level error message`() {
        assertEquals("Root command failed", describeThrowable(IllegalStateException("Root command failed")))
    }

    @Test
    fun `includes the root cause of initializer failures`() {
        val failure = ExceptionInInitializerError(IllegalArgumentException("Invalid runtime pattern"))

        assertEquals(
            "ExceptionInInitializerError <- IllegalArgumentException: Invalid runtime pattern",
            describeThrowable(failure),
        )
    }
}
