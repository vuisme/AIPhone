export type NodeType =
  | 'START'
  | 'DELAY'
  | 'SET_VARIABLE'
  | 'IF'
  | 'LOG'
  | 'TTS_SPEAK'
  | 'WAIT_IMAGE'
  | 'IF_IMAGE'
  | 'TAP_IMAGE'
  | 'TAP_TEXT'
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

const VARIABLE_REFERENCE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/

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
  disabled?: boolean
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export type WorkflowValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'

export interface WorkflowParameter {
  name: string
  type: WorkflowValueType
  defaultValue: unknown
  description?: string
}

interface AssetBase {
  id: string
  workflowId: string
  name: string
  updatedAt: string
}

export interface ImageAssetRecord extends AssetBase {
  type: 'IMAGE'
  fileName: string
  sha256?: string
  threshold: number
  searchRegion?: Region
  width: number
  height: number
}

export type SelectorMatchMode = 'EXACT' | 'CONTAINS'

export interface UiBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface UiSelector {
  text?: string
  contentDescription?: string
  resourceId?: string
  className?: string
  packageName?: string
  bounds?: UiBounds
  matchMode: SelectorMatchMode
}

export interface UiSelectorAssetRecord extends AssetBase {
  type: 'UI_SELECTOR'
  selector: UiSelector
}

export type AssetRecord = ImageAssetRecord | UiSelectorAssetRecord

export interface WorkflowDocument {
  schemaVersion: 2
  id: string
  name: string
  revision: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  assets: AssetRecord[]
  parameters: WorkflowParameter[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowSummary {
  id: string
  name: string
  revision: number
  nodeCount: number
  assetCount: number
  updatedAt: string
}

export interface ValidationResult {
  valid: boolean
  issues: string[]
}

const IMAGE_NODE_TYPES = new Set<NodeType>(['WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE'])
const NODE_TYPES = new Set<NodeType>([
  'START', 'DELAY', 'SET_VARIABLE', 'IF', 'LOG', 'WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE', 'TAP_TEXT', 'TAP_POINT', 'SWIPE',
  'TTS_SPEAK', 'LAUNCH_APP', 'FORCE_STOP_APP', 'CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE', 'LOOP', 'SUCCESS', 'FAILURE',
])
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/
const VARIABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/
const VALUE_TYPES = new Set<WorkflowValueType>(['STRING', 'NUMBER', 'BOOLEAN', 'JSON'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function migrateRegion(value: unknown): Region | undefined {
  const region = asRecord(value)
  if (!['x', 'y', 'width', 'height'].every((field) => typeof region[field] === 'number' && Number.isFinite(region[field]))) return undefined
  return { x: region.x as number, y: region.y as number, width: region.width as number, height: region.height as number }
}

function migrateBounds(value: unknown): UiBounds | undefined {
  const bounds = asRecord(value)
  if (!['left', 'top', 'right', 'bottom'].every((field) => typeof bounds[field] === 'number' && Number.isFinite(bounds[field]))) return undefined
  return { left: bounds.left as number, top: bounds.top as number, right: bounds.right as number, bottom: bounds.bottom as number }
}

function migrateAsset(value: unknown, workflowId: string): AssetRecord | undefined {
  const record = asRecord(value)
  const id = typeof record.id === 'string' ? record.id : ''
  const name = typeof record.name === 'string' ? record.name : id
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
  if (!ID_PATTERN.test(id)) return undefined

  if (record.type === 'UI_SELECTOR') {
    const selector = asRecord(record.selector)
    return {
      id,
      workflowId,
      type: 'UI_SELECTOR',
      name,
      selector: {
        text: typeof selector.text === 'string' ? selector.text : undefined,
        contentDescription: typeof selector.contentDescription === 'string' ? selector.contentDescription : undefined,
        resourceId: typeof selector.resourceId === 'string' ? selector.resourceId : undefined,
        className: typeof selector.className === 'string' ? selector.className : undefined,
        packageName: typeof selector.packageName === 'string' ? selector.packageName : undefined,
        bounds: migrateBounds(selector.bounds),
        matchMode: selector.matchMode === 'CONTAINS' ? 'CONTAINS' : 'EXACT',
      },
      updatedAt,
    }
  }

  return {
    id,
    workflowId,
    type: 'IMAGE',
    name,
    fileName: typeof record.fileName === 'string' ? record.fileName : `${id}.png`,
    sha256: typeof record.sha256 === 'string' ? record.sha256 : undefined,
    threshold: asNumber(record.threshold, 0.88),
    searchRegion: migrateRegion(record.searchRegion),
    width: asNumber(record.width),
    height: asNumber(record.height),
    updatedAt,
  }
}

function normalizeDefaultValue(type: WorkflowValueType, value: unknown): unknown {
  if (type === 'STRING') return typeof value === 'string' ? value : String(value ?? '')
  if (type === 'NUMBER') {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'BOOLEAN') return value === true || value === 'true'
  return value ?? null
}

function migrateParameter(value: unknown): WorkflowParameter | undefined {
  const record = asRecord(value)
  const name = typeof record.name === 'string' ? record.name : ''
  const type = typeof record.type === 'string' && VALUE_TYPES.has(record.type as WorkflowValueType)
    ? record.type as WorkflowValueType
    : 'STRING'
  if (!VARIABLE_PATTERN.test(name)) return undefined
  return {
    name,
    type,
    defaultValue: normalizeDefaultValue(type, record.defaultValue),
    description: typeof record.description === 'string' && record.description.trim() ? record.description : undefined,
  }
}

export function normalizeWorkflow(value: unknown): WorkflowDocument {
  const source = asRecord(value)
  const now = new Date().toISOString()
  const id = typeof source.id === 'string' && ID_PATTERN.test(source.id) ? source.id : 'default-workflow'
  const sourceAssets = Array.isArray(source.assets) ? source.assets : Array.isArray(source.templates) ? source.templates : []
  const assets = sourceAssets.map((asset) => migrateAsset(asset, id)).filter((asset): asset is AssetRecord => Boolean(asset))
  const parameters = (Array.isArray(source.parameters) ? source.parameters : [])
    .map(migrateParameter)
    .filter((parameter): parameter is WorkflowParameter => Boolean(parameter))
  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).map((value) => {
    const node = asRecord(value)
    const config = { ...asRecord(node.config) }
    const position = asRecord(node.position)
    if (typeof config.assetId !== 'string' && typeof config.templateId === 'string') config.assetId = config.templateId
    delete config.templateId
    return {
      id: String(node.id ?? ''),
      type: String(node.type ?? 'DELAY') as NodeType,
      position: { x: asNumber(position.x), y: asNumber(position.y) },
      config,
      disabled: node.disabled === true || undefined,
    }
  })

  return {
    schemaVersion: 2,
    id,
    name: typeof source.name === 'string' ? source.name : 'Workflow mới',
    revision: typeof source.revision === 'number' ? source.revision : 1,
    nodes,
    edges: (Array.isArray(source.edges) ? source.edges : []).map((value) => {
      const edge = asRecord(value)
      return {
        id: String(edge.id ?? ''),
        source: String(edge.source ?? ''),
        target: String(edge.target ?? ''),
        sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : undefined,
      }
    }),
    assets,
    parameters,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
  }
}

export function createStarterWorkflow(name = 'Liên Quân reroll', id = 'default-workflow'): WorkflowDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: 2,
    id,
    name,
    revision: 1,
    nodes: [
      { id: 'start', type: 'START', position: { x: 80, y: 160 }, config: {} },
      { id: 'success', type: 'SUCCESS', position: { x: 420, y: 160 }, config: { message: 'Hoàn tất' } },
    ],
    edges: [{ id: 'start-success', source: 'start', target: 'success' }],
    assets: [],
    parameters: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function summarizeWorkflow(workflow: WorkflowDocument): WorkflowSummary {
  return {
    id: workflow.id,
    name: workflow.name,
    revision: workflow.revision,
    nodeCount: workflow.nodes.length,
    assetCount: workflow.assets.length,
    updatedAt: workflow.updatedAt,
  }
}

export function validateWorkflow(workflow: WorkflowDocument): ValidationResult {
  const issues: string[] = []
  const nodeIds = new Set<string>()
  const assetsById = new Map(workflow.assets.map((asset) => [asset.id, asset]))

  if (!ID_PATTERN.test(workflow.id)) issues.push('Workflow ID is invalid')
  if (workflow.nodes.filter((node) => node.type === 'START').length !== 1) {
    issues.push('Workflow must contain exactly one START node')
  }

  const parameterNames = new Set<string>()
  for (const parameter of workflow.parameters ?? []) {
    if (!VARIABLE_PATTERN.test(parameter.name)) issues.push(`Invalid workflow parameter ${parameter.name}`)
    if (parameterNames.has(parameter.name)) issues.push(`Duplicate workflow parameter ${parameter.name}`)
    parameterNames.add(parameter.name)
  }

  const assetIds = new Set<string>()
  for (const asset of workflow.assets) {
    if (assetIds.has(asset.id)) issues.push(`Duplicate Asset id ${asset.id}`)
    assetIds.add(asset.id)
    if (asset.workflowId !== workflow.id) issues.push(`Asset ${asset.id} belongs to another workflow`)
    if (asset.type === 'UI_SELECTOR' && !asset.selector.text && !asset.selector.contentDescription && !asset.selector.resourceId) {
      issues.push(`UI selector Asset ${asset.id} has no match field`)
    }
  }

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) issues.push(`Duplicate node id ${node.id}`)
    nodeIds.add(node.id)
    if (!NODE_TYPES.has(node.type)) issues.push(`Node ${node.id} has unsupported type ${node.type}`)
    if (node.type === 'SET_VARIABLE') {
      const name = String(node.config.name ?? '')
      if (!VARIABLE_PATTERN.test(name)) issues.push(`Node ${node.id} has invalid variable name ${name}`)
    }
    if (node.type === 'TTS_SPEAK') {
      const name = String(node.config.outputVariable ?? '')
      if (name && !VARIABLE_PATTERN.test(name)) issues.push(`Node ${node.id} has invalid output variable ${name}`)
    }
    if (node.type === 'IF') {
      const name = String(node.config.leftVariable ?? '')
      if (!VARIABLE_REFERENCE_PATTERN.test(name)) issues.push(`Node ${node.id} has invalid left variable ${name}`)
    }

    if (!node.disabled && (IMAGE_NODE_TYPES.has(node.type) || node.type === 'TAP_TEXT')) {
      const assetId = node.config.assetId
      const asset = typeof assetId === 'string' ? assetsById.get(assetId) : undefined
      const expectedType = node.type === 'TAP_TEXT' ? 'UI_SELECTOR' : 'IMAGE'
      if (!asset || asset.type !== expectedType) {
        issues.push(`Node ${node.id} references missing ${expectedType} Asset ${String(assetId)}`)
      }
    }
  }

  const edgeIds = new Set<string>()
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) issues.push(`Duplicate edge id ${edge.id}`)
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) issues.push(`Edge ${edge.id} references a missing node`)
  }

  return { valid: issues.length === 0, issues }
}
