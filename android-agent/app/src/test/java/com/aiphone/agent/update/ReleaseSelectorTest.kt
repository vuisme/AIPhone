package com.aiphone.agent.update

import com.aiphone.agent.UpdateChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReleaseSelectorTest {
    @Test
    fun `stable selects the highest semantic version and ignores prereleases`() {
        val selected = ReleaseSelector.select(
            releases = listOf(
                release("v0.2.0", prerelease = false, asset("AIPhone-v0.2.0-vc24.apk", 24)),
                release("nightly", prerelease = true, asset("AIPhone-nightly-vc30.apk", 30)),
                release("v0.10.0", prerelease = false, asset("AIPhone-v0.10.0-vc28.apk", 28)),
            ),
            channel = UpdateChannel.STABLE,
            currentVersionCode = 20,
        )

        assertEquals("v0.10.0", selected?.tagName)
        assertEquals(28L, selected?.versionCode)
    }

    @Test
    fun `nightly selects the newest valid nightly APK`() {
        val selected = ReleaseSelector.select(
            releases = listOf(
                release("nightly", prerelease = true, asset("AIPhone-nightly-vc31.apk", 31)),
                release("nightly", prerelease = true, asset("AIPhone-nightly-vc33.apk", 33)),
                release("nightly-copy", prerelease = true, asset("AIPhone-nightly-vc99.apk", 99)),
            ),
            channel = UpdateChannel.NIGHTLY,
            currentVersionCode = 30,
        )

        assertEquals(33L, selected?.versionCode)
        assertEquals("AIPhone-nightly-vc33.apk", selected?.assetName)
    }

    @Test
    fun `rejects downgrade mismatched asset and foreign download URL`() {
        assertNull(ReleaseSelector.select(
            releases = listOf(
                release("v0.3.0", prerelease = false, asset("AIPhone-v0.2.0-vc40.apk", 40)),
                release("v0.4.0", prerelease = false, asset("AIPhone-v0.4.0-vc41.apk", 41, "https://example.com/a.apk")),
                release("v0.5.0", prerelease = false, asset("AIPhone-v0.5.0-vc39.apk", 39)),
            ),
            channel = UpdateChannel.STABLE,
            currentVersionCode = 39,
        ))
    }

    private fun release(tag: String, prerelease: Boolean, vararg assets: ReleaseAsset) = AppRelease(
        tagName = tag,
        name = tag,
        prerelease = prerelease,
        draft = false,
        assets = assets.toList(),
    )

    private fun asset(name: String, versionCode: Long, url: String = "https://github.com/vuisme/AIPhone/releases/download/${if (name.contains("nightly")) "nightly" else name.substringAfter("AIPhone-").substringBefore("-vc")}/$name") = ReleaseAsset(
        name = name,
        downloadUrl = url,
        sizeBytes = 10_000_000,
    ).also { require(name.contains("vc$versionCode.apk")) }
}
