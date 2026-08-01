package com.aiphone.agent.update

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.aiphone.agent.UpdateChannel
import com.aiphone.agent.root.RootGateway
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest

sealed interface UpdateCheckResult {
    data class Current(val message: String) : UpdateCheckResult
    data class Ready(val candidate: UpdateCandidate, val apkFile: File) : UpdateCheckResult
}

sealed interface InteractiveInstallResult {
    data object Launched : InteractiveInstallResult
    data object PermissionRequired : InteractiveInstallResult
}

class AppUpdater(private val context: Context) {
    fun check(channel: UpdateChannel, currentVersionCode: Long, onProgress: (String) -> Unit): UpdateCheckResult {
        onProgress("Đang đọc kênh ${channel.name.lowercase()}...")
        val releases = parseReleases(fetchApi())
        val candidate = ReleaseSelector.select(releases, channel, currentVersionCode)
            ?: return UpdateCheckResult.Current("Đang dùng phiên bản mới nhất của kênh ${channel.name.lowercase()}.")
        onProgress("Đang tải ${candidate.assetName}...")
        val file = download(candidate)
        onProgress("Đang xác minh APK và chữ ký...")
        verifyPackage(file, candidate)
        return UpdateCheckResult.Ready(candidate, file)
    }

    fun installWithRoot(apkFile: File): String {
        val result = RootGateway.installDownloadedPackage(apkFile, updateDirectory())
        check(result.isSuccess) { result.text.ifBlank { "Cài đặt bằng root thất bại" } }
        return result.text.ifBlank { "Đã gửi lệnh cài đặt" }
    }

    fun launchInteractiveInstall(activity: Activity, apkFile: File): InteractiveInstallResult {
        if (!context.packageManager.canRequestPackageInstalls()) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
            return InteractiveInstallResult.PermissionRequired
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apkFile)
        activity.startActivity(Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        return InteractiveInstallResult.Launched
    }

    private fun fetchApi(): String {
        val connection = URL(RELEASES_API).openConnection() as HttpURLConnection
        return connection.useConnection {
            instanceFollowRedirects = false
            connectTimeout = 10_000
            readTimeout = 15_000
            requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "AIPhone-Agent/${com.aiphone.agent.BuildConfig.VERSION_NAME}")
            check(responseCode == HttpURLConnection.HTTP_OK) { "GitHub API trả về HTTP $responseCode" }
            readBounded(inputStream, MAX_API_BYTES).toString(Charsets.UTF_8)
        }
    }

    private fun parseReleases(raw: String): List<AppRelease> {
        val root = JSONArray(raw)
        return (0 until minOf(root.length(), MAX_RELEASES)).mapNotNull { index ->
            val release = root.optJSONObject(index) ?: return@mapNotNull null
            val tagName = release.optString("tag_name").take(MAX_FIELD_LENGTH)
            if (tagName.isBlank()) return@mapNotNull null
            val assetsJson = release.optJSONArray("assets") ?: JSONArray()
            val assets = (0 until minOf(assetsJson.length(), MAX_ASSETS_PER_RELEASE)).mapNotNull assetLoop@ { assetIndex ->
                val asset = assetsJson.optJSONObject(assetIndex) ?: return@assetLoop null
                val name = asset.optString("name").take(MAX_FIELD_LENGTH)
                val url = asset.optString("browser_download_url").take(MAX_URL_LENGTH)
                val size = asset.optLong("size", -1)
                if (name.isBlank() || url.isBlank() || size <= 0) return@assetLoop null
                ReleaseAsset(name, url, size)
            }
            AppRelease(
                tagName = tagName,
                name = release.optString("name", tagName).take(MAX_FIELD_LENGTH),
                prerelease = release.optBoolean("prerelease", false),
                draft = release.optBoolean("draft", true),
                assets = assets,
            )
        }
    }

    private fun download(candidate: UpdateCandidate): File {
        val directory = updateDirectory().apply { mkdirs() }
        check(directory.isDirectory) { "Không thể tạo thư mục cập nhật" }
        val partial = File(directory, "$UPDATE_FILE_NAME.part")
        val target = File(directory, UPDATE_FILE_NAME)
        partial.delete()
        target.delete()

        var current = candidate.downloadUrl
        repeat(MAX_REDIRECTS + 1) { hop ->
            check(UpdateUrlPolicy.isAllowedDownloadHop(current)) { "GitHub trả về URL tải không hợp lệ" }
            val connection = URL(current).openConnection() as HttpURLConnection
            val next = connection.useConnection {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 45_000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/octet-stream")
                setRequestProperty("User-Agent", "AIPhone-Agent/${com.aiphone.agent.BuildConfig.VERSION_NAME}")
                when (responseCode) {
                    HttpURLConnection.HTTP_MOVED_PERM,
                    HttpURLConnection.HTTP_MOVED_TEMP,
                    HttpURLConnection.HTTP_SEE_OTHER,
                    307, 308 -> {
                        check(hop < MAX_REDIRECTS) { "GitHub chuyển hướng quá nhiều lần" }
                        val location = getHeaderField("Location") ?: error("GitHub redirect thiếu Location")
                        URI(current).resolve(location).toString()
                    }
                    HttpURLConnection.HTTP_OK -> {
                        val declared = contentLengthLong
                        check(declared == -1L || declared == candidate.sizeBytes) { "Kích thước APK không khớp metadata GitHub" }
                        partial.outputStream().use { output ->
                            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                            var total = 0L
                            inputStream.use { input ->
                                while (true) {
                                    val read = input.read(buffer)
                                    if (read < 0) break
                                    total += read
                                    check(total <= candidate.sizeBytes && total <= UpdateUrlPolicy.MAX_APK_BYTES) { "APK vượt quá kích thước cho phép" }
                                    output.write(buffer, 0, read)
                                }
                            }
                            check(total == candidate.sizeBytes) { "APK tải xuống không đủ dữ liệu" }
                        }
                        check(partial.renameTo(target)) { "Không thể hoàn tất file APK" }
                        return target
                    }
                    else -> error("Tải APK thất bại: HTTP $responseCode")
                }
            }
            current = next
        }
        error("GitHub chuyển hướng quá nhiều lần")
    }

    private fun verifyPackage(apkFile: File, candidate: UpdateCandidate) {
        val archive = packageInfo(apkFile.absolutePath) ?: error("File tải xuống không phải APK hợp lệ")
        check(archive.packageName == context.packageName) { "APK không thuộc gói ${context.packageName}" }
        check(archive.longVersionCode == candidate.versionCode) { "Version code trong APK không khớp GitHub Release" }

        val installed = packageInfo(context.packageName) ?: error("Không đọc được chữ ký bản đang cài")
        check(signerDigests(archive) == signerDigests(installed)) { "Chữ ký APK không khớp bản đang cài" }
    }

    @Suppress("DEPRECATION")
    private fun packageInfo(pathOrPackage: String): PackageInfo? = if (Build.VERSION.SDK_INT >= 33) {
        if (pathOrPackage.endsWith(".apk")) {
            context.packageManager.getPackageArchiveInfo(pathOrPackage, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        } else {
            context.packageManager.getPackageInfo(pathOrPackage, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        }
    } else if (pathOrPackage.endsWith(".apk")) {
        context.packageManager.getPackageArchiveInfo(pathOrPackage, PackageManager.GET_SIGNING_CERTIFICATES)
    } else {
        context.packageManager.getPackageInfo(pathOrPackage, PackageManager.GET_SIGNING_CERTIFICATES)
    }

    private fun signerDigests(info: PackageInfo): Set<String> {
        val signatures = info.signingInfo?.apkContentsSigners ?: emptyArray()
        check(signatures.isNotEmpty()) { "APK không có chữ ký" }
        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }.toSet()
    }

    private fun readBounded(input: java.io.InputStream, maximum: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        input.use {
            while (true) {
                val read = it.read(buffer)
                if (read < 0) break
                check(output.size() + read <= maximum) { "Phản hồi GitHub quá lớn" }
                output.write(buffer, 0, read)
            }
        }
        return output.toByteArray()
    }

    private inline fun <T> HttpURLConnection.useConnection(block: HttpURLConnection.() -> T): T = try {
        block()
    } finally {
        disconnect()
    }

    private fun updateDirectory() = File(context.cacheDir, "updates")

    companion object {
        private const val RELEASES_API = "https://api.github.com/repos/vuisme/AIPhone/releases?per_page=30"
        private const val UPDATE_FILE_NAME = "aiphone-update.apk"
        private const val MAX_API_BYTES = 2 * 1024 * 1024
        private const val MAX_RELEASES = 30
        private const val MAX_ASSETS_PER_RELEASE = 20
        private const val MAX_FIELD_LENGTH = 200
        private const val MAX_URL_LENGTH = 2_000
        private const val MAX_REDIRECTS = 5
    }
}
