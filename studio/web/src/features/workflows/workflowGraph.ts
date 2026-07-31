import type { WorkflowNode } from '../../contracts/workflow'

export function removeEdgeById<T extends { id: string }>(edges: T[], edgeId: string): T[] {
  if (!edges.some((edge) => edge.id === edgeId)) return edges
  return edges.filter((edge) => edge.id !== edgeId)
}

export function toggleNodeDisabled(nodes: WorkflowNode[], nodeId: string): WorkflowNode[] {
  return nodes.map((node) => node.id === nodeId ? { ...node, disabled: !node.disabled } : node)
}
