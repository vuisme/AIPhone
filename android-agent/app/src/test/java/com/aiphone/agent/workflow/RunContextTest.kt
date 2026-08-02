package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class RunContextTest {
    @Test
    fun `stores typed values and exposes them as run data`() {
        val context = RunContext()

        context.set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))
        context.set("accountReady", RunValue(WorkflowValueType.BOOLEAN, false))

        assertEquals(3.0, context.require("rewardCount").value)
        assertFalse(context.snapshot().getValue("accountReady").value as Boolean)
    }

    @Test
    fun `interpolates variables for log messages`() {
        val context = RunContext()
        context.set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))

        assertEquals("Đã nhận 3 phần quà", context.interpolate("Đã nhận {{rewardCount}} phần quà"))
    }

    @Test
    fun `resolves package config from a global variable`() {
        val context = RunContext()
        context.set("gamePackage", RunValue(WorkflowValueType.STRING, "com.garena.game.kgvn"))

        assertEquals("com.garena.game.kgvn", context.interpolate("{{ gamePackage }}"))
    }

    @Test
    fun `resolves nested fields from structured node output`() {
        val context = RunContext().apply {
            set("ttsResult", RunValue(WorkflowValueType.JSON, mapOf(
                "file" to mapOf(
                    "path" to "/data/user/0/com.aiphone.agent/files/audio/voice.wav",
                    "artifactId" to "audio-1",
                ),
            )))
        }

        assertEquals(
            "/data/user/0/com.aiphone.agent/files/audio/voice.wav",
            context.require("ttsResult.file.path").value,
        )
        assertEquals(
            "Upload /data/user/0/com.aiphone.agent/files/audio/voice.wav",
            context.interpolate("Upload {{ttsResult.file.path}}"),
        )
    }

    @Test
    fun `fails clearly when a template references an unknown variable`() {
        val error = assertThrows(IllegalStateException::class.java) {
            RunContext().interpolate("{{missingPackage}}")
        }

        assertEquals("Variable missingPackage is not defined", error.message)
    }
}
