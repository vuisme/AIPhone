package com.aiphone.agent.root

import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit

data class CommandResult(val exitCode: Int, val output: ByteArray) {
    val text: String get() = output.toString(Charsets.UTF_8).trim()
    val isSuccess: Boolean get() = exitCode == 0
}

object RootGateway {
    @Volatile private var cachedRoot: Boolean? = null
    @Volatile private var cachedPrimaryDisplayId: String? = null

    fun invalidateRootState() {
        cachedRoot = null
        cachedPrimaryDisplayId = null
    }

    fun isRootGranted(): Boolean {
        cachedRoot?.let { return it }
        val granted = runRoot(listOf("id"), timeoutSeconds = 5).let { it.isSuccess && it.text.contains("uid=0") }
        cachedRoot = granted
        return granted
    }

    fun captureScreen(): ByteArray {
        val captureArgs = primaryDisplayId()?.let { listOf("screencap", "-d", it, "-p") }
            ?: listOf("screencap", "-p")
        val rooted = runRoot(captureArgs, timeoutSeconds = 8, mergeError = false)
        if (rooted.isSuccess && rooted.output.isNotEmpty()) return rooted.output
        val direct = runProcess(captureArgs, timeoutSeconds = 8, mergeError = false)
        check(direct.isSuccess && direct.output.isNotEmpty()) { "Screenshot failed: ${direct.text}" }
        return direct.output
    }

    private fun primaryDisplayId(): String? {
        cachedPrimaryDisplayId?.let { return it }
        val displays = runRoot(listOf("dumpsys", "SurfaceFlinger", "--display-id"), timeoutSeconds = 5)
        if (!displays.isSuccess) return null
        return PrimaryDisplaySelector.fromSurfaceFlinger(displays.text)?.also { cachedPrimaryDisplayId = it }
    }

    fun tap(x: Int, y: Int): CommandResult {
        require(x in 0..10000 && y in 0..10000)
        return runRoot(listOf("input", "tap", x.toString(), y.toString()))
    }

    fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Int): CommandResult {
        require(listOf(x1, y1, x2, y2).all { it in 0..10000 })
        require(durationMs in 1..60000)
        return runRoot(listOf("input", "swipe", x1.toString(), y1.toString(), x2.toString(), y2.toString(), durationMs.toString()))
    }

    fun executeSafe(args: List<String>): CommandResult = runRoot(args)

    fun installDownloadedPackage(apkFile: File, allowedDirectory: File): CommandResult {
        val target = apkFile.canonicalFile
        val directory = allowedDirectory.canonicalFile
        require(target.isFile && target.name == "aiphone-update.apk") { "Update APK is invalid" }
        require(target.parentFile == directory) { "Update APK is outside the app update directory" }
        require(target.length() in 1..MAX_UPDATE_APK_BYTES) { "Update APK size is invalid" }
        return runRoot(listOf("pm", "install", "-r", "--user", "0", target.absolutePath), timeoutSeconds = 120)
    }

    private fun runRoot(args: List<String>, timeoutSeconds: Long = 15, mergeError: Boolean = true): CommandResult {
        val command = args.joinToString(" ") { shellQuote(it) }
        return runProcess(listOf("su", "-c", command), timeoutSeconds, mergeError)
    }

    private fun runProcess(args: List<String>, timeoutSeconds: Long, mergeError: Boolean = true): CommandResult {
        return try {
            val process = ProcessBuilder(args).redirectErrorStream(mergeError).start()
            val output = ByteArrayOutputStream()
            val errorOutput = ByteArrayOutputStream()
            val reader = Thread { process.inputStream.use { it.copyTo(output) } }.apply { start() }
            val errorReader = if (mergeError) null else Thread { process.errorStream.use { it.copyTo(errorOutput) } }.apply { start() }
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                reader.join(1000)
                errorReader?.join(1000)
                CommandResult(-1, "Command timed out".toByteArray())
            } else {
                reader.join(1000)
                errorReader?.join(1000)
                val exitCode = process.exitValue()
                CommandResult(exitCode, if (exitCode == 0 || mergeError) output.toByteArray() else errorOutput.toByteArray())
            }
        } catch (error: Exception) {
            CommandResult(-1, (error.message ?: error.javaClass.simpleName).toByteArray())
        }
    }

    private fun shellQuote(value: String): String = "'${value.replace("'", "'\\''")}'"

    private const val MAX_UPDATE_APK_BYTES = 150L * 1024 * 1024
}
