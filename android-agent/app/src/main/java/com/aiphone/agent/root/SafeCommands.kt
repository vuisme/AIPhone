package com.aiphone.agent.root

object SafeCommands {
    const val TARGET_PACKAGE = "com.garena.game.kgvn"
    const val MAIN_USER_ID = 0
    const val CLONE_USER_ID = 999

    fun createClone(packageName: String, userId: Int): List<String> {
        validateClone(packageName, userId)
        return listOf("cmd", "package", "install-existing", "--user", userId.toString(), packageName)
    }

    fun deleteClone(packageName: String, userId: Int): List<String> {
        validateClone(packageName, userId)
        return listOf("pm", "uninstall", "--user", userId.toString(), packageName)
    }

    fun clearClone(packageName: String, userId: Int): List<String> {
        validateClone(packageName, userId)
        return listOf("pm", "clear", "--user", userId.toString(), packageName)
    }

    fun forceStop(packageName: String, userId: Int): List<String> {
        validateAppTarget(packageName, userId)
        return listOf("am", "force-stop", "--user", userId.toString(), packageName)
    }

    fun resolveLauncher(packageName: String, userId: Int): List<String> {
        validateAppTarget(packageName, userId)
        return listOf(
            "cmd", "package", "resolve-activity", "--brief", "--user", userId.toString(),
            "-a", "android.intent.action.MAIN",
            "-c", "android.intent.category.LAUNCHER",
            packageName,
        )
    }

    fun launchComponent(packageName: String, userId: Int, componentName: String): List<String> {
        validateAppTarget(packageName, userId)
        require(componentName.startsWith("$packageName/")) { "Launcher component is outside the allowlisted package" }
        require(COMPONENT_PATTERN.matches(componentName)) { "Launcher component is invalid" }
        return listOf("am", "start", "--user", userId.toString(), "-n", componentName)
    }

    private fun validateClone(packageName: String, userId: Int) {
        validatePackage(packageName)
        require(userId == CLONE_USER_ID) { "Clone operations require XSpace user 999" }
    }

    private fun validateAppTarget(packageName: String, userId: Int) {
        validatePackage(packageName)
        require(userId == MAIN_USER_ID || userId == CLONE_USER_ID) { "Only main user 0 or XSpace user 999 is allowed" }
    }

    private fun validatePackage(packageName: String) {
        require(packageName == TARGET_PACKAGE) { "Package is not allowlisted" }
    }

    private val COMPONENT_PATTERN = Regex("[a-zA-Z0-9._]+/[a-zA-Z0-9._]+")
}
