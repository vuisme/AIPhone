package com.aiphone.agent.root

object SafeCommands {
    const val TARGET_PACKAGE = "com.garena.game.kgvn"
    const val CLONE_USER_ID = 999

    fun createClone(packageName: String, userId: Int): List<String> {
        validate(packageName, userId)
        return listOf("cmd", "package", "install-existing", "--user", userId.toString(), packageName)
    }

    fun deleteClone(packageName: String, userId: Int): List<String> {
        validate(packageName, userId)
        return listOf("pm", "uninstall", "--user", userId.toString(), packageName)
    }

    fun clearClone(packageName: String, userId: Int): List<String> {
        validate(packageName, userId)
        return listOf("pm", "clear", "--user", userId.toString(), packageName)
    }

    fun forceStop(packageName: String, userId: Int): List<String> {
        validate(packageName, userId)
        return listOf("am", "force-stop", "--user", userId.toString(), packageName)
    }

    fun launch(packageName: String, userId: Int): List<String> {
        validate(packageName, userId)
        return listOf(
            "am", "start", "--user", userId.toString(),
            "-a", "android.intent.action.MAIN",
            "-c", "android.intent.category.LAUNCHER",
            packageName,
        )
    }

    private fun validate(packageName: String, userId: Int) {
        require(packageName == TARGET_PACKAGE) { "Package is not allowlisted" }
        require(userId == CLONE_USER_ID) { "Only XSpace user 999 is allowed" }
    }
}

