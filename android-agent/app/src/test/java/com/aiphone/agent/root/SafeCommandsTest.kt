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
    fun `resolves the launcher activity for the configured Android user`() {
        assertEquals(
            listOf(
                "cmd", "package", "resolve-activity", "--brief", "--user", "0",
                "-a", "android.intent.action.MAIN",
                "-c", "android.intent.category.LAUNCHER",
                "com.garena.game.kgvn",
            ),
            SafeCommands.resolveLauncher("com.garena.game.kgvn", 0),
        )
    }

    @Test
    fun `launches only a resolved component inside the configured package`() {
        assertEquals(
            listOf(
                "am", "start", "--user", "999", "-n",
                "com.garena.game.kgvn/com.garena.game.kgtw.SGameActivity",
            ),
            SafeCommands.launchComponent(
                "com.garena.game.kgvn",
                999,
                "com.garena.game.kgvn/com.garena.game.kgtw.SGameActivity",
            ),
        )
    }

    @Test
    fun `rejects a launcher component from another package`() {
        assertThrows(IllegalArgumentException::class.java) {
            SafeCommands.launchComponent("com.garena.game.kgvn", 999, "com.example.other/.MainActivity")
        }
    }
}
