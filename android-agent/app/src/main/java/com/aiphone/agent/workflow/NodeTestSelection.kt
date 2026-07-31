package com.aiphone.agent.workflow

internal fun selectSingleNodeIndex(nodeIds: List<String>, requestedNodeId: String): Int {
    val matches = nodeIds.withIndex().filter { it.value == requestedNodeId }
    require(matches.size == 1) { "Workflow must contain exactly one node named $requestedNodeId" }
    return matches.single().index
}
