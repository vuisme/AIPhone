export type NodeType =
  | 'START'
  | 'DELAY'
  | 'WAIT_IMAGE'
  | 'IF_IMAGE'
  | 'TAP_IMAGE'
  | 'TAP_POINT'
  | 'SWIPE'
  | 'LAUNCH_APP'
  | 'FORCE_STOP_APP'
  | 'CREATE_CLONE'
  | 'DELETE_CLONE'
  | 'CLEAR_CLONE'
  | 'LOOP'
  | 'SUCCESS'
  | 'FAILURE'

export interface Position {
  x: number
  y: number
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkflowNode {
  id: string
  type: NodeType
  position: Position
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export interface TemplateRecord {
  id: string
  name: string
  fileName: string
  threshold: number
  searchRegion?: Region
  width: number
  height: number
  updatedAt: string
}

export interface WorkflowDocument {
  schemaVersion: 1
  id: string
  name: string
  revision: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  templates: TemplateRecord[]
  createdAt: string
  updatedAt: string
}

export interface ValidationResult {
  valid: boolean
  issues: string[]
}

const IMAGE_NODE_TYPES = new Set<NodeType>(['WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE'])

export function createStarterWorkflow(): WorkflowDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: 'default-workflow',
    name: 'Liên Quân reroll',
    revision: 1,
    nodes: [
      { id: 'start', type: 'START', position: { x: 80, y: 160 }, config: {} },
      { id: 'success', type: 'SUCCESS', position: { x: 420, y: 160 }, config: { message: 'Hoàn tất' } },
    ],
    edges: [{ id: 'start-success', source: 'start', target: 'success' }],
    templates: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function validateWorkflow(workflow: WorkflowDocument): ValidationResult {
  const issues: string[] = []
  const nodeIds = new Set<string>()
  const templateIds = new Set(workflow.templates.map((template) => template.id))

  if (workflow.nodes.filter((node) => node.type === 'START').length !== 1) {
    issues.push('Workflow must contain exactly one START node')
  }

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(`Duplicate node id ${node.id}`)
    }
    nodeIds.add(node.id)

    if (IMAGE_NODE_TYPES.has(node.type)) {
      const templateId = node.config.templateId
      if (typeof templateId !== 'string' || !templateIds.has(templateId)) {
        issues.push(`Node ${node.id} references missing template ${String(templateId)}`)
      }
    }
  }

  const edgeIds = new Set<string>()
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push(`Duplicate edge id ${edge.id}`)
    }
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push(`Edge ${edge.id} references a missing node`)
    }
  }

  return { valid: issues.length === 0, issues }
}
