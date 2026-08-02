package com.aiphone.agent.workflow

import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.Closeable
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class AndroidTtsGateway(context: Context) : TtsGateway {
    private val applicationContext = context.applicationContext

    override fun capabilities(): TtsCapabilities {
        val now = System.currentTimeMillis()
        cachedCapabilities?.takeIf { now - it.first < CAPABILITY_CACHE_MS }?.let { return it.second }
        return synchronized(CAPABILITY_LOCK) {
            cachedCapabilities?.takeIf { now - it.first < CAPABILITY_CACHE_MS }?.second ?: run {
                val discovered = openSession(null).use { defaultSession ->
                    val defaultEngine = defaultSession.tts.defaultEngine
                    val engines = defaultSession.tts.engines.mapNotNull { engine ->
                        runCatching {
                            openSession(engine.name).use { session ->
                                TtsEngineCapability(
                                    packageName = engine.name,
                                    label = engine.label ?: engine.name,
                                    voices = session.voicePairs().map { it.second }.sortedWith(
                                        compareBy<TtsVoiceDescriptor> { it.languageTag }.thenBy { it.name },
                                    ),
                                )
                            }
                        }.getOrNull()
                    }
                    TtsCapabilities(engines.isNotEmpty(), defaultEngine, engines)
                }
                cachedCapabilities = System.currentTimeMillis() to discovered
                discovered
            }
        }
    }

    override fun refreshCapabilities(): TtsCapabilities {
        synchronized(CAPABILITY_LOCK) { cachedCapabilities = null }
        return capabilities()
    }

    override fun synthesize(options: TtsSpeakOptions, outputFile: File, isCancelled: () -> Boolean): TtsSynthesisResult =
        openSession(options.enginePackage).use { session ->
            val pairs = session.voicePairs()
            val selected = TtsVoiceSelector.select(pairs.map { it.second }, options.languageTag, options.preferredVoice)
            val voice = selected?.let { descriptor -> pairs.single { it.second.name == descriptor.name }.first }
            if (voice != null) {
                check(session.tts.setVoice(voice) == TextToSpeech.SUCCESS) { "TTS voice ${voice.name} is unavailable" }
            } else {
                val languageStatus = session.tts.setLanguage(Locale.forLanguageTag(options.languageTag))
                check(languageStatus != TextToSpeech.LANG_MISSING_DATA && languageStatus != TextToSpeech.LANG_NOT_SUPPORTED) {
                    "TTS language ${options.languageTag} is not supported by this phone"
                }
            }
            check(session.tts.setSpeechRate(options.speechRate) == TextToSpeech.SUCCESS) { "Cannot set TTS speech rate" }
            check(session.tts.setPitch(options.pitch) == TextToSpeech.SUCCESS) { "Cannot set TTS pitch" }

            outputFile.parentFile?.mkdirs()
            val utteranceId = UUID.randomUUID().toString()
            val completion = CountDownLatch(1)
            val failure = AtomicReference<String?>()
            session.tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) = Unit
                override fun onDone(id: String?) { if (id == utteranceId) completion.countDown() }
                @Deprecated("Android calls the overload with an error code")
                override fun onError(id: String?) { if (id == utteranceId) { failure.set("TTS synthesis failed"); completion.countDown() } }
                override fun onError(id: String?, errorCode: Int) {
                    if (id == utteranceId) { failure.set("TTS synthesis failed with code $errorCode"); completion.countDown() }
                }
            })
            check(session.tts.synthesizeToFile(options.text, Bundle(), outputFile, utteranceId) == TextToSpeech.SUCCESS) {
                "TTS engine rejected the synthesis request"
            }
            awaitCancellable(completion, SYNTHESIS_TIMEOUT_SECONDS * 1_000, isCancelled) { session.tts.stop() }
            failure.get()?.let { error(it) }
            check(outputFile.isFile && outputFile.length() > 0) { "TTS engine did not create an audio file" }
            check(outputFile.length() <= MAX_AUDIO_ARTIFACT_BYTES) { "TTS audio exceeds the 15 MB artifact limit" }

            val durationMs = audioDuration(outputFile)
            val played = if (options.playAudio) playFile(outputFile, durationMs, isCancelled) else false
            val actualVoice = session.tts.voice
            TtsSynthesisResult(
                enginePackage = session.tts.defaultEngine ?: options.enginePackage.orEmpty(),
                voiceName = actualVoice?.name ?: selected?.name.orEmpty(),
                languageTag = actualVoice?.locale?.toLanguageTag() ?: selected?.languageTag ?: options.languageTag,
                played = played,
                durationMs = durationMs,
            )
        }

    private fun openSession(enginePackage: String?): Session {
        val ready = CountDownLatch(1)
        val status = AtomicInteger(TextToSpeech.ERROR)
        val reference = AtomicReference<TextToSpeech?>()
        Handler(Looper.getMainLooper()).post {
            val tts = TextToSpeech(applicationContext, { result -> status.set(result); ready.countDown() }, enginePackage)
            reference.set(tts)
        }
        check(ready.await(INIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            reference.get()?.shutdown()
            "Android TTS initialization timed out"
        }
        val tts = reference.get() ?: error("Android TTS initialization failed")
        check(status.get() == TextToSpeech.SUCCESS) {
            tts.shutdown()
            "Android TTS engine ${enginePackage ?: "default"} is unavailable"
        }
        return Session(tts)
    }

    private fun audioDuration(file: File): Long = runCatching {
        MediaMetadataRetriever().use { retriever ->
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        }
    }.getOrDefault(0L)

    private fun playFile(file: File, durationMs: Long, isCancelled: () -> Boolean): Boolean {
        val completed = CountDownLatch(1)
        val failed = AtomicReference<String?>()
        val player = MediaPlayer()
        try {
            player.setDataSource(file.absolutePath)
            player.setOnCompletionListener { completed.countDown() }
            player.setOnErrorListener { _, what, extra ->
                failed.set("Audio playback failed ($what/$extra)")
                completed.countDown()
                true
            }
            player.prepare()
            player.start()
            val timeoutMs = (durationMs.takeIf { it > 0 } ?: 60_000L).coerceAtMost(10 * 60_000L) + 10_000L
            awaitCancellable(completed, timeoutMs, isCancelled) { runCatching { player.stop() } }
            failed.get()?.let { error(it) }
            return true
        } finally {
            runCatching { player.stop() }
            player.release()
        }
    }

    private fun awaitCancellable(latch: CountDownLatch, timeoutMs: Long, isCancelled: () -> Boolean, onCancel: () -> Unit) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (isCancelled()) {
                onCancel()
                error("TTS operation was cancelled")
            }
            if (latch.await(200, TimeUnit.MILLISECONDS)) return
        }
        error("TTS operation timed out")
    }

    private class Session(val tts: TextToSpeech) : Closeable {
        fun voicePairs() = tts.voices.orEmpty().map { voice ->
            voice to TtsVoiceDescriptor(
                name = voice.name,
                languageTag = voice.locale.toLanguageTag(),
                quality = voice.quality,
                latency = voice.latency,
                requiresNetwork = voice.isNetworkConnectionRequired,
                features = voice.features.orEmpty(),
            )
        }

        override fun close() {
            tts.stop()
            tts.shutdown()
        }
    }

    companion object {
        private val CAPABILITY_LOCK = Any()
        @Volatile private var cachedCapabilities: Pair<Long, TtsCapabilities>? = null
        private const val INIT_TIMEOUT_SECONDS = 15L
        private const val SYNTHESIS_TIMEOUT_SECONDS = 120L
        private const val CAPABILITY_CACHE_MS = 5 * 60_000L
        private const val MAX_AUDIO_ARTIFACT_BYTES = 15 * 1024 * 1024L
    }
}
