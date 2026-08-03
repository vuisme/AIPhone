package com.aiphone.agent

import org.junit.Assert.assertEquals
import org.junit.Test

class UpdateChannelTest {
    @Test
    fun `nightly builds follow the nightly update channel by default`() {
        assertEquals(UpdateChannel.NIGHTLY, UpdateChannel.defaultForVersionName("0.2.0-nightly.31"))
        assertEquals(UpdateChannel.NIGHTLY, UpdateChannel.defaultForVersionName("NIGHTLY"))
    }

    @Test
    fun `stable builds follow the stable update channel by default`() {
        assertEquals(UpdateChannel.STABLE, UpdateChannel.defaultForVersionName("0.2.0"))
        assertEquals(UpdateChannel.STABLE, UpdateChannel.defaultForVersionName("v1.4.2"))
    }
}
