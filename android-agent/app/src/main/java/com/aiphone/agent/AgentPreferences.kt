package com.aiphone.agent

import android.content.Context

enum class UpdateChannel { STABLE, NIGHTLY }

class AgentPreferences(context: Context) {
    private val values = context.getSharedPreferences("aiphone-agent", Context.MODE_PRIVATE)

    var serviceEnabled: Boolean
        get() = values.getBoolean("serviceEnabled", true)
        set(value) { values.edit().putBoolean("serviceEnabled", value).apply() }

    var updateChannel: UpdateChannel
        get() = runCatching { UpdateChannel.valueOf(values.getString("updateChannel", UpdateChannel.STABLE.name)!!) }.getOrDefault(UpdateChannel.STABLE)
        set(value) { values.edit().putString("updateChannel", value.name).apply() }
}
