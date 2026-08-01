package com.aiphone.agent.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateUrlPolicyTest {
    @Test
    fun `accepts only the canonical release asset URL`() {
        assertTrue(UpdateUrlPolicy.isCanonicalAssetUrl(
            "https://github.com/vuisme/AIPhone/releases/download/nightly/AIPhone-nightly-vc42.apk",
            "nightly",
            "AIPhone-nightly-vc42.apk",
        ))
        assertFalse(UpdateUrlPolicy.isCanonicalAssetUrl(
            "https://github.com/attacker/AIPhone/releases/download/nightly/AIPhone-nightly-vc42.apk",
            "nightly",
            "AIPhone-nightly-vc42.apk",
        ))
    }

    @Test
    fun `allows only known GitHub download redirect hosts`() {
        assertTrue(UpdateUrlPolicy.isAllowedDownloadHop("https://release-assets.githubusercontent.com/github-production-release-asset/file.apk"))
        assertTrue(UpdateUrlPolicy.isAllowedDownloadHop("https://github.com/vuisme/AIPhone/releases/download/nightly/file.apk"))
        assertFalse(UpdateUrlPolicy.isAllowedDownloadHop("http://github.com/vuisme/AIPhone/file.apk"))
        assertFalse(UpdateUrlPolicy.isAllowedDownloadHop("https://github.com.evil.example/file.apk"))
    }
}
