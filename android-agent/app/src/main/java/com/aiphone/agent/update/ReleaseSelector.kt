package com.aiphone.agent.update

import com.aiphone.agent.UpdateChannel

data class ReleaseAsset(
    val name: String,
    val downloadUrl: String,
    val sizeBytes: Long,
)

data class AppRelease(
    val tagName: String,
    val name: String,
    val prerelease: Boolean,
    val draft: Boolean,
    val assets: List<ReleaseAsset>,
)

data class UpdateCandidate(
    val tagName: String,
    val displayName: String,
    val versionCode: Long,
    val assetName: String,
    val downloadUrl: String,
    val sizeBytes: Long,
)

object ReleaseSelector {
    private val stableTag = Regex("^v(\\d+)\\.(\\d+)\\.(\\d+)$")
    private val stableAsset = Regex("^AIPhone-(v\\d+\\.\\d+\\.\\d+)-vc(\\d+)\\.apk$")
    private val nightlyAsset = Regex("^AIPhone-nightly-vc(\\d+)\\.apk$")

    fun select(releases: List<AppRelease>, channel: UpdateChannel, currentVersionCode: Long): UpdateCandidate? {
        val candidate = when (channel) {
            UpdateChannel.STABLE -> releases.mapNotNull(::stableCandidate).maxWithOrNull(
                compareBy<Pair<SemanticVersion, UpdateCandidate>> { it.first }.thenBy { it.second.versionCode },
            )?.second
            UpdateChannel.NIGHTLY -> releases.mapNotNull(::nightlyCandidate).maxByOrNull { it.versionCode }
        }
        return candidate?.takeIf { it.versionCode > currentVersionCode }
    }

    private fun stableCandidate(release: AppRelease): Pair<SemanticVersion, UpdateCandidate>? {
        if (release.draft || release.prerelease) return null
        val tagMatch = stableTag.matchEntire(release.tagName) ?: return null
        val version = SemanticVersion(tagMatch.groupValues[1].toIntOrNull() ?: return null, tagMatch.groupValues[2].toIntOrNull() ?: return null, tagMatch.groupValues[3].toIntOrNull() ?: return null)
        val asset = release.assets.mapNotNull { item ->
            val match = stableAsset.matchEntire(item.name) ?: return@mapNotNull null
            if (match.groupValues[1] != release.tagName || !validAsset(release.tagName, item)) return@mapNotNull null
            item to (match.groupValues[2].toLongOrNull() ?: return@mapNotNull null)
        }.maxByOrNull { it.second } ?: return null
        return version to asset.first.toCandidate(release, asset.second)
    }

    private fun nightlyCandidate(release: AppRelease): UpdateCandidate? {
        if (release.draft || !release.prerelease || release.tagName != "nightly") return null
        val asset = release.assets.mapNotNull { item ->
            val match = nightlyAsset.matchEntire(item.name) ?: return@mapNotNull null
            if (!validAsset(release.tagName, item)) return@mapNotNull null
            item to (match.groupValues[1].toLongOrNull() ?: return@mapNotNull null)
        }.maxByOrNull { it.second } ?: return null
        return asset.first.toCandidate(release, asset.second)
    }

    private fun validAsset(tag: String, asset: ReleaseAsset): Boolean =
        asset.sizeBytes in 1..UpdateUrlPolicy.MAX_APK_BYTES &&
            UpdateUrlPolicy.isCanonicalAssetUrl(asset.downloadUrl, tag, asset.name)

    private fun ReleaseAsset.toCandidate(release: AppRelease, versionCode: Long) = UpdateCandidate(
        tagName = release.tagName,
        displayName = release.name.ifBlank { release.tagName },
        versionCode = versionCode,
        assetName = name,
        downloadUrl = downloadUrl,
        sizeBytes = sizeBytes,
    )

    private data class SemanticVersion(val major: Int, val minor: Int, val patch: Int) : Comparable<SemanticVersion> {
        override fun compareTo(other: SemanticVersion): Int =
            compareValuesBy(this, other, SemanticVersion::major, SemanticVersion::minor, SemanticVersion::patch)
    }
}
