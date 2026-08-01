package com.aiphone.agent.root

object PrimaryDisplaySelector {
    private val primaryDisplayPattern = Regex("(?m)^Display\\s+(\\d+)\\s+\\(HWC display 0\\):")

    fun fromSurfaceFlinger(output: String): String? =
        primaryDisplayPattern.find(output)?.groupValues?.get(1)
}
