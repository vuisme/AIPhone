package com.aiphone.agent.workflow

class LoopRuntime {
    private data class State(val nodeId: String, val iteration: Int)

    private val states = linkedMapOf<String, State>()

    fun enter(nodeId: String, loopId: String, maxIterations: Int): Int {
        require(loopId.matches(LOOP_ID_PATTERN)) { "Invalid loop ID $loopId" }
        require(maxIterations >= 0) { "Loop limit cannot be negative" }
        val current = states[loopId]
        check(current == null || current.nodeId == nodeId) { "Duplicate loop ID $loopId" }
        val nextIteration = (current?.iteration ?: 0) + 1
        check(maxIterations == 0 || nextIteration <= maxIterations) {
            "Loop $loopId exceeded its limit of $maxIterations iterations"
        }
        states[loopId] = State(nodeId, nextIteration)
        return nextIteration
    }

    fun repeatTarget(loopId: String): String = states[loopId]?.nodeId
        ?: error("Loop breakpoint references inactive loop ID $loopId")

    fun complete(loopId: String) {
        check(states.remove(loopId) != null) { "Loop breakpoint references inactive loop ID $loopId" }
    }

    companion object {
        private val LOOP_ID_PATTERN = Regex("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")
    }
}
