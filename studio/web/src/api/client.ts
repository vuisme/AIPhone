import type { ImageAssetRecord, WorkflowDocument, WorkflowSummary } from '../contracts/workflow'

const TOKEN_KEY = 'aiphone.direct-pairing-token'
const DEVICE_KEY = 'aiphone.adb-serial'
function resolveBridgeOrigin(): string {
  const configured = (import.meta.env.VITE_BRIDGE_ORIGIN ?? '').replace(/\/$/, '')
  if (!configured) return ''
  const url = new URL(configured)
  if (['127.0.0.1', 'localhost'].includes(url.hostname) && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
    url.hostname = window.location.hostname
  }
  return url.toString().replace(/\/$/, '')
}

const BRIDGE_ORIGIN = resolveBridgeOrigin()
let selectedSerial = sessionStorage.getItem(DEVICE_KEY) ?? ''
let csrfToken = ''

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

function isMutation(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method || 'GET').toUpperCase())
}

function hostFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (isMutation(init.method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  return fetch(`${BRIDGE_ORIGIN}${path}`, { ...init, headers, credentials: 'include' })
}

function agentFetch(path: string, init: RequestInit = {}, serial = selectedSerial) {
  if (serial) return hostFetch(`/bridge/devices/${encodeURIComponent(serial)}${path}`, init)
  const headers = new Headers(init.headers)
  const token = sessionStorage.getItem(tokenKey(serial)) ?? (serial === selectedSerial ? pairingToken : '')
  if (token) headers.set('X-AIPhone-Token', token)
  return fetch(path, { ...init, headers })
}

function projectFetch(path: string, init: RequestInit = {}) {
  return hostFetch(path, init)
}

export interface StudioUser {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'USER'
  status: 'ACTIVE' | 'DISABLED'
  createdAt?: string
  updatedAt?: string
}

export interface AuthSession {
  user: StudioUser
  csrfToken: string
  legacyImported?: number
}

export interface AdbDevice {
  serial: string
  state: 'device' | 'offline' | 'unauthorized' | string
  model: string | null
  product: string | null
  transportId: string | null
  claimed?: boolean
  authorized?: boolean
  paired?: boolean
  canPair?: boolean
  deviceId?: string
  ownerUserId?: string
  ownerDisplayName?: string
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

export interface ResourceGrant {
  userId: string
  permission: 'EDIT' | 'USE'
  email: string
  displayName: string
}

export interface ManagedDevice {
  id: string
  serial: string
  label?: string | null
  model?: string | null
  ownerUserId: string
  ownerDisplayName?: string
  hasCredential: boolean
  createdAt?: string
  updatedAt?: string
}

export const authApi = {
  async setupStatus(): Promise<{ setupRequired: boolean }> {
    return parseJson(await hostFetch('/auth/setup-status', { cache: 'no-store' }))
  },

  async setup(input: { email: string; displayName: string; password: string }): Promise<AuthSession> {
    const session = await parseJson<AuthSession>(await hostFetch('/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }))
    csrfToken = session.csrfToken
    return session
  },

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const session = await parseJson<AuthSession>(await hostFetch('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }))
    csrfToken = session.csrfToken
    return session
  },

  async session(): Promise<AuthSession> {
    const session = await parseJson<AuthSession>(await hostFetch('/auth/session', { cache: 'no-store' }))
    csrfToken = session.csrfToken
    return session
  },

  async logout(): Promise<void> {
    const response = await hostFetch('/auth/logout', { method: 'POST' })
    if (!response.ok) throw await apiError(response)
    csrfToken = ''
  },
}

export const adminApi = {
  async getUsers(): Promise<StudioUser[]> {
    const result = await parseJson<{ users: StudioUser[] }>(await hostFetch('/admin/users'))
    return result.users
  },

  async createUser(input: { email: string; displayName: string; password: string; role: 'ADMIN' | 'USER' }): Promise<StudioUser> {
    return parseJson(await hostFetch('/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }))
  },

  async updateUser(userId: string, input: Partial<Pick<StudioUser, 'displayName' | 'role' | 'status'>>): Promise<StudioUser> {
    return parseJson(await hostFetch(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }))
  },

  async resetPassword(userId: string, password: string): Promise<StudioUser> {
    return parseJson(await hostFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    }))
  },

  async getWorkflowGrants(workflowId: string): Promise<ResourceGrant[]> {
    const result = await parseJson<{ grants: ResourceGrant[] }>(await hostFetch(`/admin/workflows/${encodeURIComponent(workflowId)}/grants`))
    return result.grants
  },

  async setWorkflowGrant(workflowId: string, userId: string, enabled: boolean): Promise<void> {
    const response = await hostFetch(`/admin/workflows/${encodeURIComponent(workflowId)}/grants/${encodeURIComponent(userId)}`, { method: enabled ? 'PUT' : 'DELETE' })
    if (!response.ok) throw await apiError(response)
  },

  async getDevices(): Promise<ManagedDevice[]> {
    const result = await parseJson<{ devices: ManagedDevice[] }>(await hostFetch('/studio/devices'))
    return result.devices
  },

  async getDeviceGrants(deviceId: string): Promise<ResourceGrant[]> {
    const result = await parseJson<{ grants: ResourceGrant[] }>(await hostFetch(`/admin/devices/${encodeURIComponent(deviceId)}/grants`))
    return result.grants
  },

  async setDeviceGrant(deviceId: string, userId: string, enabled: boolean): Promise<void> {
    const response = await hostFetch(`/admin/devices/${encodeURIComponent(deviceId)}/grants/${encodeURIComponent(userId)}`, { method: enabled ? 'PUT' : 'DELETE' })
    if (!response.ok) throw await apiError(response)
  },
}

export const credentialApi = {
  async status(serial = selectedSerial): Promise<{ claimed: boolean; authorized?: boolean; paired: boolean; canPair: boolean }> {
    return parseJson(await hostFetch(`/studio/devices/${encodeURIComponent(serial)}/credential`))
  },

  async save(token: string, serial = selectedSerial): Promise<void> {
    await parseJson(await hostFetch(`/studio/devices/${encodeURIComponent(serial)}/credential`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }))
  },

  async forget(serial = selectedSerial): Promise<void> {
    const response = await hostFetch(`/studio/devices/${encodeURIComponent(serial)}/credential`, { method: 'DELETE' })
    if (!response.ok) throw await apiError(response)
  },
}

export const bridgeApi = {
  async getDevices(): Promise<AdbDevice[]> {
    const response = await hostFetch('/bridge/devices', { cache: 'no-store' })
    const result = await parseJson<{ devices: AdbDevice[] }>(response)
    return result.devices
  },

  async captureScreen(serial = selectedSerial): Promise<Blob> {
    const response = await hostFetch(`/bridge/devices/${encodeURIComponent(serial)}/screen`, { cache: 'no-store' })
    if (!response.ok) throw new Error(apiErrorMessage(await response.text(), response.status))
    return response.blob()
  },

  async tapDevice(x: number, y: number, serial = selectedSerial): Promise<void> {
    const response = await hostFetch(`/bridge/devices/${encodeURIComponent(serial)}/input/tap`, {
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

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function apiError(response: Response): Promise<ApiError> {
  const body = await response.text()
  let code: string | undefined
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } }
    code = typeof parsed.error === 'object' ? parsed.error.code : undefined
  } catch {
    // Plain Agent and legacy bridge errors do not carry a code.
  }
  if (response.headers.get('x-aiphone-pairing-rejected') === '1') code = 'PAIRING_REQUIRED'
  const error = new ApiError(apiErrorMessage(body, response.status), response.status, code)
  if (error.status === 401 && error.code === 'AUTH_REQUIRED') window.dispatchEvent(new Event('aiphone:auth-required'))
  return error
}

export function isAuthenticationError(reason: unknown): boolean {
  return reason instanceof ApiError && reason.status === 401 && reason.code !== 'PAIRING_REQUIRED'
}

export function isPairingError(reason: unknown): boolean {
  return reason instanceof ApiError && [401, 403].includes(reason.status) && (reason.code === 'PAIRING_REQUIRED' || /pairing credential/i.test(reason.message))
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await apiError(response)
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
