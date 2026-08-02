package com.aiphone.agent.workflow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TtsWorkflowTest {
    private val vietnameseLocal = TtsVoiceDescriptor(
        name = "vi-vn-x-vif-local",
        languageTag = "vi-VN",
        quality = 400,
        latency = 200,
        requiresNetwork = false,
    )

    @Test
    fun `parses interpolated text and safe defaults`() {
        val context = RunContext().apply {
            set("playerName", RunValue(WorkflowValueType.STRING, "Jolene"))
        }

        val options = TtsSpeakOptions.fromValues("Xin chào {{playerName}}", context)

        assertEquals("Xin chào Jolene", options.text)
        assertEquals("vi-VN", options.languageTag)
        assertEquals(1f, options.speechRate)
        assertTrue(options.saveAudio)
        assertFalse(options.playAudio)
    }

    @Test
    fun `rejects an invalid output variable before synthesis`() {
        val error = assertThrows(IllegalArgumentException::class.java) {
            TtsSpeakOptions.fromValues("Hello", RunContext(), outputVariable = "audio result")
        }

        assertEquals("Invalid variable name audio result", error.message)
    }

    @Test
    fun `uses preferred voice when it is compatible`() {
        val preferred = vietnameseLocal.copy(name = "preferred")

        assertEquals(
            preferred,
            TtsVoiceSelector.select(listOf(vietnameseLocal, preferred), "vi-VN", "preferred"),
        )
    }

    @Test
    fun `falls back to the best local voice for another phone`() {
        val network = vietnameseLocal.copy(name = "network", quality = 500, requiresNetwork = true)
        val lowerQuality = vietnameseLocal.copy(name = "lower", quality = 300, latency = 100)

        assertEquals(
            vietnameseLocal,
            TtsVoiceSelector.select(listOf(network, lowerQuality, vietnameseLocal), "vi-VN", "missing-on-this-phone"),
        )
    }

    @Test
    fun `does not select an unrelated language`() {
        val english = vietnameseLocal.copy(name = "en", languageTag = "en-US")

        assertNull(TtsVoiceSelector.select(listOf(english), "vi-VN", null))
    }

    @Test
    fun `assigns structured output to a new runtime variable`() {
        val context = RunContext()
        val result = mapOf("artifactId" to "audio-1", "played" to true)

        TtsResultBinder.assign(context, "speechResult", result)

        assertEquals(WorkflowValueType.JSON, context.require("speechResult").type)
        assertEquals("audio-1", (context.require("speechResult").value as Map<*, *>)["artifactId"])
    }

    @Test
    fun `accepts only opaque audio artifact IDs`() {
        assertTrue(AudioArtifactId.isValid("87b6b073-f3a6-4e0b-9c06-794e79f7e3b8"))
        assertFalse(AudioArtifactId.isValid("../workflow.json"))
        assertFalse(AudioArtifactId.isValid("audio/file"))
    }
}
