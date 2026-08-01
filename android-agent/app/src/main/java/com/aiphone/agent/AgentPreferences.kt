package com.aiphone.agent

import android.content.Context
import com.aiphone.agent.callback.CallbackIdentity

enum class UpdateChannel { STABLE, NIGHTLY }

class AgentPreferences(context: Context) {
    private val values = context.getSharedPreferences("aiphone-agent", Context.MODE_PRIVATE)

    var serviceEnabled: Boolean
        get() = values.getBoolean("serviceEnabled", true)
        set(value) { values.edit().putBoolean("serviceEnabled", value).apply() }

    var updateChannel: UpdateChannel
        get() = runCatching { UpdateChannel.valueOf(values.getString("updateChannel", UpdateChannel.STABLE.name)!!) }.getOrDefault(UpdateChannel.STABLE)
        set(value) { values.edit().putString("updateChannel", value.name).apply() }

    var callbackEnabled: Boolean
        get() = values.getBoolean("callbackEnabled", false)
        set(value) { values.edit().putBoolean("callbackEnabled", value).apply() }

    var callbackUrl: String
        get() = values.getString("callbackUrl", "").orEmpty()
        set(value) { values.edit().putString("callbackUrl", value.trim()).apply() }

    fun callbackIdentity(): CallbackIdentity {
        val deviceId = values.getString("callbackDeviceId", null)
        val secret = values.getString("callbackDeviceSecret", null)
        val code = values.getString("callbackPairingCode", null)
        if (deviceId != null && secret != null && code != null) return CallbackIdentity(deviceId, secret, code)
        return CallbackIdentity.create().also(::saveCallbackIdentity)
    }

    fun rotateCallbackPairingCode(): CallbackIdentity {
        val current = callbackIdentity()
        return current.copy(pairingCode = CallbackIdentity.newPairingCode()).also(::saveCallbackIdentity)
    }

    private fun saveCallbackIdentity(identity: CallbackIdentity) {
        values.edit()
            .putString("callbackDeviceId", identity.deviceId)
            .putString("callbackDeviceSecret", identity.deviceSecret)
            .putString("callbackPairingCode", identity.pairingCode)
            .apply()
    }
}
