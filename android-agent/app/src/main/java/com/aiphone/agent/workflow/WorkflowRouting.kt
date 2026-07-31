package com.aiphone.agent.workflow

internal data class WorkflowEdgeRoute(
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
)

internal fun selectNextRoute(
    routes: List<WorkflowEdgeRoute>,
    nodeId: String,
    outcome: String?,
    disabled: Boolean,
): WorkflowEdgeRoute {
    val outgoing = routes.filter { it.source == nodeId }
    if (disabled) {
        return outgoing.firstOrNull { it.sourceHandle.isNullOrBlank() }
            ?: outgoing.firstOrNull()
            ?: error("Disabled node $nodeId has no outgoing edge")
    }
    return outgoing.firstOrNull { outcome != null && it.sourceHandle == outcome }
        ?: outgoing.firstOrNull { it.sourceHandle.isNullOrBlank() }
        ?: error("Node $nodeId has no edge for outcome ${outcome ?: "DEFAULT"}")
}
