package com.aiphone.agent.callback

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

data class CallbackIdentity(
    val deviceId: String,
    val deviceSecret: String,
    val pairingCode: String,
) {
    fun pairingCodeHash(): String = MessageDigest.getInstance("SHA-256")
        .digest(pairingCode.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    companion object {
        private const val CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        private val random = SecureRandom()

        fun create(): CallbackIdentity = CallbackIdentity(
            deviceId = "device-${UUID.randomUUID()}",
            deviceSecret = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes)),
            pairingCode = newPairingCode(),
        )

        fun newPairingCode(): String = buildString(10) {
            repeat(10) { append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]) }
        }
    }
}
