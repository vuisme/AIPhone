package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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

    @Test
    fun `evaluates JavaScript expressions while preserving exact result types`() {
        val context = RunContext().apply {
            set("rewardCount", RunValue(WorkflowValueType.NUMBER, 3.0))
            set("bonusCount", RunValue(WorkflowValueType.NUMBER, 2.0))
        }

        assertEquals(7.0, context.resolve("{{ rewardCount * 2 + 1 }}"))
        assertEquals("Số quà tiếp theo: 4", context.interpolate("Số quà tiếp theo: {{ rewardCount + 1 }}"))
        assertEquals("Quà 3 + thưởng 2", context.interpolate("Quà {{ rewardCount }} + thưởng {{ bonusCount }}"))
    }

    @Test
    fun `supports inclusive random helper and compact random shorthand`() {
        val context = RunContext()

        repeat(50) {
            val helperValue = (context.resolve("{{ random(5, 10) }}") as Number).toInt()
            val shorthandValue = (context.resolve("{{ (5,10) }}") as Number).toInt()
            assertTrue(helperValue in 5..10)
            assertTrue(shorthandValue in 5..10)
        }
    }

    @Test
    fun `resolves every scalar value in nested node config`() {
        val context = RunContext().apply {
            set("startX", RunValue(WorkflowValueType.NUMBER, 120.0))
            set("enabled", RunValue(WorkflowValueType.BOOLEAN, true))
        }
        val config = org.json.JSONObject()
            .put("x", "{{ startX + 5 }}")
            .put("label", "Tap {{ startX }}")
            .put("enabled", "{{ enabled }}")
            .put("options", org.json.JSONArray().put("{{ startX }}"))

        val resolved = context.resolveConfig(config)

        assertEquals(125, resolved.getInt("x"))
        assertEquals("Tap 120", resolved.getString("label"))
        assertTrue(resolved.getBoolean("enabled"))
        assertEquals(120, resolved.getJSONArray("options").getInt(0))
    }

    @Test
    fun `preserves arrays and objects returned by exact expressions`() {
        val context = RunContext()

        val objectValue = context.resolve("{{ ({ tapX: 12, enabled: true }) }}") as org.json.JSONObject
        val arrayValue = context.resolve("{{ [1, 2, 3] }}") as org.json.JSONArray

        assertEquals(12, objectValue.getInt("tapX"))
        assertTrue(objectValue.getBoolean("enabled"))
        assertEquals(3, arrayValue.length())
    }

    @Test
    fun `rejects unsafe JavaScript capabilities`() {
        val context = RunContext()

        val error = assertThrows(IllegalArgumentException::class.java) {
            context.resolve("{{ java.lang.Runtime.getRuntime().exec('id') }}")
        }

        assertTrue(error.message.orEmpty().contains("not allowed"))
    }

    @Test
    fun `resolves expression defaults for workflow input variables in declaration order`() {
        val document = org.json.JSONObject().put("parameters", org.json.JSONArray()
            .put(org.json.JSONObject().put("name", "minimum").put("type", "NUMBER").put("defaultValue", 5))
            .put(org.json.JSONObject().put("name", "delay").put("type", "NUMBER").put("defaultValue", "{{ minimum * 2 }}")))

        val context = RunContext.fromWorkflow(document)

        assertEquals(10.0, context.require("delay").value)
    }
}
