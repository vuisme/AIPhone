package com.aiphone.agent.storage

import org.junit.Assert.assertEquals
import org.junit.Test

class ContentHashTest {
    @Test
    fun `computes lowercase SHA-256`() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ContentHash.sha256("abc".toByteArray()),
        )
    }
}
