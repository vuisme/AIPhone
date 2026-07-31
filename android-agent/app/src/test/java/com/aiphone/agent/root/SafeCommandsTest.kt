package com.aiphone.agent.root

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SafeCommandsTest {
    @Test
    fun `builds an XSpace install command for the configured package`() {
        assertEquals(
            listOf("cmd", "package", "install-existing", "--user", "999", "com.garena.game.kgvn"),
            SafeCommands.createClone("com.garena.game.kgvn", 999),
        )
    }

    @Test
    fun `rejects a command targeting the main user`() {
        assertThrows(IllegalArgumentException::class.java) {
            SafeCommands.deleteClone("com.garena.game.kgvn", 0)
        }
    }

    @Test
    fun `rejects an unconfigured package`() {
        assertThrows(IllegalArgumentException::class.java) {
            SafeCommands.clearClone("com.example.other", 999)
        }
    }

    @Test
    fun `allows launching the configured package in the main Android user`() {
        assertEquals(
            listOf(
                "am", "start", "--user", "0",
                "-a", "android.intent.action.MAIN",
                "-c", "android.intent.category.LAUNCHER",
                "com.garena.game.kgvn",
            ),
            SafeCommands.launch("com.garena.game.kgvn", 0),
        )
    }
}
