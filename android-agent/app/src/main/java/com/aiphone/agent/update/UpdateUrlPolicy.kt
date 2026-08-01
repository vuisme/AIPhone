package com.aiphone.agent.update

import java.net.URI

object UpdateUrlPolicy {
    const val MAX_APK_BYTES = 150L * 1024 * 1024
    private val redirectHosts = setOf(
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
    )

    fun isCanonicalAssetUrl(rawUrl: String, tagName: String, assetName: String): Boolean {
        if (!SAFE_COMPONENT.matches(tagName) || !SAFE_COMPONENT.matches(assetName)) return false
        return rawUrl == "https://github.com/vuisme/AIPhone/releases/download/$tagName/$assetName"
    }

    fun isAllowedDownloadHop(rawUrl: String): Boolean = runCatching {
        val uri = URI(rawUrl)
        uri.scheme == "https" && uri.userInfo == null && uri.port == -1 && uri.host in redirectHosts
    }.getOrDefault(false)

    private val SAFE_COMPONENT = Regex("[A-Za-z0-9._-]+")
}
