import type { TemplateRecord, WorkflowDocument } from '../contracts/workflow'

const TOKEN_KEY = 'aiphone.pairing-token'
const DEVICE_KEY = 'aiphone.adb-serial'
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
  return serial ? `/bridge/devices/${encodeURIComponent(serial)}${path}` : path
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
  return window.location.port === '4173'
}

export function setAgentToken(value: string) {
  pairingToken = value.replace(/\s/g, '')
  sessionStorage.setItem(tokenKey(), pairingToken)
}

export function hasAgentToken(): boolean {
  return pairingToken.length > 0
}

function agentFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (pairingToken) headers.set('X-AIPhone-Token', pairingToken)
  return fetch(buildAgentPath(path), { ...init, headers })
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
}

export interface RunStatus {
  id: string
  state: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'STOPPED'
  currentNodeId?: string
  message?: string
  startedAt?: string
  finishedAt?: string
  iteration: number
}

export interface TemplateUpload {
  record: TemplateRecord
  imageBase64: string
}

export const bridgeApi = {
  async getDevices(): Promise<AdbDevice[]> {
    const response = await fetch('/bridge/devices', { cache: 'no-store' })
    const result = await parseJson<{ devices: AdbDevice[] }>(response)
    return result.devices
  },
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const agentApi = {
  async getDevice(): Promise<DeviceHealth> {
    return parseJson(await agentFetch('/api/device'))
  },

  async captureScreenshot(): Promise<Blob> {
    const response = await agentFetch('/api/screenshots', { method: 'POST' })
    if (!response.ok) throw new Error(await response.text())
    if (!response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error('Agent chưa kết nối hoặc không trả về ảnh')
    }
    return response.blob()
  },

  async getWorkflow(): Promise<WorkflowDocument> {
    return parseJson(await agentFetch('/api/workflows/default'))
  },

  async saveWorkflow(workflow: WorkflowDocument): Promise<WorkflowDocument> {
    return parseJson(
      await agentFetch('/api/workflows/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      }),
    )
  },

  async uploadTemplate(upload: TemplateUpload): Promise<TemplateRecord> {
    return parseJson(
      await agentFetch(`/api/templates/${encodeURIComponent(upload.record.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      }),
    )
  },

  async startRun(workflowId: string): Promise<RunStatus> {
    return parseJson(
      await agentFetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      }),
    )
  },

  async startNodeTest(workflowId: string, nodeId: string): Promise<RunStatus> {
    return parseJson(
      await agentFetch('/api/node-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, nodeId }),
      }),
    )
  },

  async stopRun(): Promise<RunStatus> {
    return parseJson(await agentFetch('/api/runs/current/stop', { method: 'POST' }))
  },

  async getRunStatus(): Promise<RunStatus> {
    return parseJson(await agentFetch('/api/runs/current'))
  },
}
