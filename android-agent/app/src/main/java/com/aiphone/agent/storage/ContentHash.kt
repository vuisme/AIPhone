package com.aiphone.agent.storage

import java.security.MessageDigest

object ContentHash {
    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }
}
