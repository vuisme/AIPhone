import type { TemplateRecord, WorkflowDocument } from '../contracts/workflow'

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

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const agentApi = {
  async getDevice(): Promise<DeviceHealth> {
    return parseJson(await fetch('/api/device'))
  },

  async captureScreenshot(): Promise<Blob> {
    const response = await fetch('/api/screenshots', { method: 'POST' })
    if (!response.ok) throw new Error(await response.text())
    if (!response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error('Agent chưa kết nối hoặc không trả về ảnh')
    }
    return response.blob()
  },

  async getWorkflow(): Promise<WorkflowDocument> {
    return parseJson(await fetch('/api/workflows/default'))
  },

  async saveWorkflow(workflow: WorkflowDocument): Promise<WorkflowDocument> {
    return parseJson(
      await fetch('/api/workflows/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      }),
    )
  },

  async uploadTemplate(upload: TemplateUpload): Promise<TemplateRecord> {
    return parseJson(
      await fetch(`/api/templates/${encodeURIComponent(upload.record.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      }),
    )
  },

  async startRun(workflowId: string): Promise<RunStatus> {
    return parseJson(
      await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      }),
    )
  },

  async stopRun(): Promise<RunStatus> {
    return parseJson(await fetch('/api/runs/current/stop', { method: 'POST' }))
  },

  async getRunStatus(): Promise<RunStatus> {
    return parseJson(await fetch('/api/runs/current'))
  },
}
