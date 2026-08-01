import type { ImageAssetRecord, WorkflowDocument, WorkflowSummary } from '../contracts/workflow'

const TOKEN_KEY = 'aiphone.pairing-token'
const DEVICE_KEY = 'aiphone.adb-serial'
const BRIDGE_ORIGIN = (import.meta.env.VITE_BRIDGE_ORIGIN ?? '').replace(/\/$/, '')
let selectedSerial = sessionStorage.getItem(DEVICE_KEY) ?? ''

function tokenKey(serial = selectedSerial): string {
  return serial ? `${TOKEN_KEY}.${serial}` : TOKEN_KEY
}

const queryToken = new URLSearchParams(window.location.search).get('token')
if (queryToken) {
  sessionStorage.setItem(tokenKey(), queryToken.replace(/\s/g, ''))
  history.replaceState(null, '', window.location.pathname)
}

let pairingToken = sessionStorage.getItem(tokenKey()) ?? ''

export function buildAgentPath(path: string, serial = selectedSerial): string {
  return serial ? `${BRIDGE_ORIGIN}/bridge/devices/${encodeURIComponent(serial)}${path}` : path
}

export function buildBridgeDevicePath(path: string, serial = selectedSerial): string {
  if (!serial) throw new Error('Chưa chọn điện thoại USB')
  return `${BRIDGE_ORIGIN}/bridge/devices/${encodeURIComponent(serial)}${path}`
}

export function getAgentDeviceSerial(): string {
  return selectedSerial
}

export function setAgentDeviceSerial(serial: string) {
  selectedSerial = serial
  if (serial) sessionStorage.setItem(DEVICE_KEY, serial)
  else sessionStorage.removeItem(DEVICE_KEY)
  pairingToken = sessionStorage.getItem(tokenKey(serial)) ?? ''
}

export function isStandaloneStudio(): boolean {
  return BRIDGE_ORIGIN.length > 0 || window.location.port === '4173'
}

export function setAgentToken(value: string, serial = selectedSerial) {
  pairingToken = value.replace(/\s/g, '')
  sessionStorage.setItem(tokenKey(serial), pairingToken)
}

export function hasAgentToken(serial = selectedSerial): boolean {
  return (sessionStorage.getItem(tokenKey(serial)) ?? (serial === selectedSerial ? pairingToken : '')).length > 0
}

function agentFetch(path: string, init: RequestInit = {}, serial = selectedSerial) {
  const headers = new Headers(init.headers)
  const token = sessionStorage.getItem(tokenKey(serial)) ?? (serial === selectedSerial ? pairingToken : '')
  if (token) headers.set('X-AIPhone-Token', token)
  return fetch(buildAgentPath(path, serial), { ...init, headers })
}

function projectFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BRIDGE_ORIGIN}${path}`, init)
}

export interface AdbDevice {
  serial: string
  state: 'device' | 'offline' | 'unauthorized' | string
  model: string | null
  product: string | null
  transportId: string | null
}

export interface DeviceHealth {
  model: string
  androidVersion: string
  hyperOsVersion: string
  rootGranted: boolean
  serverVersion: string
  displayWidth: number
  displayHeight: number
  cloneUserId: number
  accessibilityReady: boolean
  accessibilityEnabled?: boolean
  serviceRunning?: boolean
  capabilities?: {
    workflowStorage: boolean
    mainUserLaunch: boolean
    accessibilityInput: boolean
    imageMatching: boolean
    xspace: boolean
    silentUpdate: boolean
  }
}

export interface RunStatus {
  id: string
  state: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'STOPPED'
  currentNodeId?: string
  message?: string
  startedAt?: string
  finishedAt?: string
  iteration: number
  logs?: RunLogEntry[]
  variables?: Record<string, RunValue>
  lastResult?: NodeResult
}

export interface RunValue {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'
  value: unknown
}

export interface NodeResult {
  outcome?: string
  value?: RunValue
  metadata?: Record<string, unknown>
}

export interface RunLogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | string
  message: string
  nodeId?: string
}

export interface AssetUpload {
  record: ImageAssetRecord
  imageBase64: string
}

export interface UiHierarchyNode {
  id: number
  parentId?: number
  text: string
  contentDescription: string
  resourceId: string
  className: string
  packageName: string
  clickable: boolean
  enabled: boolean
  visible: boolean
  bounds: { left: number; top: number; right: number; bottom: number }
}

export interface UiHierarchySnapshot {
  capturedAt: string
  packageName: string
  nodes: UiHierarchyNode[]
  xml: string
  surfaceOnly: boolean
}

export interface WorkflowInventory {
  workflowId: string
  exists: boolean
  revision: number
  assets: Array<{ id: string; sha256: string }>
}

export const bridgeApi = {
  async getDevices(): Promise<AdbDevice[]> {
    const response = await fetch(`${BRIDGE_ORIGIN}/bridge/devices`, { cache: 'no-store' })
    const result = await parseJson<{ devices: AdbDevice[] }>(response)
    return result.devices
  },

  async captureScreen(serial = selectedSerial): Promise<Blob> {
    const response = await fetch(buildBridgeDevicePath('/screen', serial), { cache: 'no-store' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
    return response.blob()
  },

  async tapDevice(x: number, y: number, serial = selectedSerial): Promise<void> {
    const response = await fetch(buildBridgeDevicePath('/input/tap', serial), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y }),
    })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  },
}

export const projectApi = {
  async getWorkflows(): Promise<WorkflowSummary[]> {
    const result = await parseJson<{ workflows: WorkflowSummary[] }>(await projectFetch('/studio/workflows'))
    return result.workflows
  },

  async getWorkflow(workflowId: string): Promise<WorkflowDocument> {
    return parseJson(await projectFetch(`/studio/workflows/${encodeURIComponent(workflowId)}`))
  },

  async createWorkflow(workflow: WorkflowDocument): Promise<WorkflowDocument> {
    return parseJson(await projectFetch('/studio/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflow),
    }))
  },

  async saveWorkflow(workflow: WorkflowDocument): Promise<WorkflowDocument> {
    return parseJson(await projectFetch(`/studio/workflows/${encodeURIComponent(workflow.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflow),
    }))
  },

  async deleteWorkflow(workflowId: string): Promise<void> {
    const response = await projectFetch(`/studio/workflows/${encodeURIComponent(workflowId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  },

  async uploadAsset(upload: AssetUpload): Promise<ImageAssetRecord> {
    return parseJson(await projectFetch(`/studio/workflows/${encodeURIComponent(upload.record.workflowId)}/assets/${encodeURIComponent(upload.record.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upload),
    }))
  },

  async getAssetImage(workflowId: string, assetId: string): Promise<Blob> {
    const response = await projectFetch(`/studio/workflows/${encodeURIComponent(workflowId)}/assets/${encodeURIComponent(assetId)}`)
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
    return response.blob()
  },

  async deleteAssetFile(workflowId: string, assetId: string): Promise<void> {
    const response = await projectFetch(`/studio/workflows/${encodeURIComponent(workflowId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  },
}

export function apiErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string } }
    return (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) || `HTTP ${status}`
  } catch {
    return body || `HTTP ${status}`
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  return response.json() as Promise<T>
}

export const agentApi = {
  async getDevice(serial = selectedSerial): Promise<DeviceHealth> {
    return parseJson(await agentFetch('/api/device', {}, serial))
  },

  async captureScreenshot(): Promise<Blob> {
    const response = await agentFetch('/api/screenshots', { method: 'POST' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
    if (!response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error('Agent chưa kết nối hoặc không trả về ảnh')
    }
    return response.blob()
  },

  async getWorkflows(serial = selectedSerial): Promise<WorkflowSummary[]> {
    const result = await parseJson<{ workflows: WorkflowSummary[] }>(await agentFetch('/api/workflows', {}, serial))
    return result.workflows
  },

  async getWorkflow(workflowId: string, serial = selectedSerial): Promise<WorkflowDocument> {
    return parseJson(await agentFetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {}, serial))
  },

  async createWorkflow(workflow: WorkflowDocument): Promise<WorkflowDocument> {
    return parseJson(await agentFetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    }))
  },

  async saveWorkflow(workflow: WorkflowDocument, serial = selectedSerial): Promise<WorkflowDocument> {
    return parseJson(
      await agentFetch(`/api/workflows/${encodeURIComponent(workflow.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      }, serial),
    )
  },

  async deleteWorkflow(workflowId: string): Promise<void> {
    const response = await agentFetch(`/api/workflows/${encodeURIComponent(workflowId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  },

  async uploadAsset(upload: AssetUpload, serial = selectedSerial): Promise<ImageAssetRecord> {
    return parseJson(
      await agentFetch(`/api/workflows/${encodeURIComponent(upload.record.workflowId)}/assets/${encodeURIComponent(upload.record.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      }, serial),
    )
  },

  async deleteAssetFile(workflowId: string, assetId: string): Promise<void> {
    const response = await agentFetch(`/api/workflows/${encodeURIComponent(workflowId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
  },

  async getAssetImage(workflowId: string, assetId: string, serial = selectedSerial): Promise<Blob> {
    const response = await agentFetch(`/api/workflows/${encodeURIComponent(workflowId)}/assets/${encodeURIComponent(assetId)}`, {}, serial)
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
    return response.blob()
  },

  async getUiHierarchy(): Promise<UiHierarchySnapshot> {
    return parseJson(await agentFetch('/api/ui-hierarchy', { method: 'POST' }))
  },

  async getWorkflowInventory(workflowId: string, serial = selectedSerial): Promise<WorkflowInventory> {
    return parseJson(await agentFetch(`/api/workflows/${encodeURIComponent(workflowId)}/inventory`, {}, serial))
  },

  async startRun(workflowId: string, serial = selectedSerial): Promise<RunStatus> {
    return parseJson(
      await agentFetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      }, serial),
    )
  },

  async startNodeTest(workflowId: string, nodeId: string, serial = selectedSerial): Promise<RunStatus> {
    return parseJson(
      await agentFetch('/api/node-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, nodeId }),
      }, serial),
    )
  },

  async stopRun(serial = selectedSerial): Promise<RunStatus> {
    return parseJson(await agentFetch('/api/runs/current/stop', { method: 'POST' }, serial))
  },

  async getRunStatus(serial = selectedSerial): Promise<RunStatus> {
    return parseJson(await agentFetch('/api/runs/current', {}, serial))
  },
}
