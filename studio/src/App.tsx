import { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, CircleStop, CloudOff, Cpu, Play, Save, Smartphone, Wifi } from 'lucide-react'
import { agentApi, type DeviceHealth, type RunStatus, type TemplateUpload } from './api/client'
import { createStarterWorkflow, validateWorkflow, type WorkflowDocument } from './contracts/workflow'
import { TemplateCapture } from './features/templates/TemplateCapture'
import { WorkflowCanvas } from './features/workflows/WorkflowCanvas'

const LOCAL_WORKFLOW_KEY = 'aiphone.workflow.v1'

function loadLocalWorkflow(): WorkflowDocument {
  try {
    const stored = localStorage.getItem(LOCAL_WORKFLOW_KEY)
    return stored ? JSON.parse(stored) as WorkflowDocument : createStarterWorkflow()
  } catch {
    return createStarterWorkflow()
  }
}

export function App() {
  const [workflow, setWorkflow] = useState<WorkflowDocument>(loadLocalWorkflow)
  const [device, setDevice] = useState<DeviceHealth>()
  const [run, setRun] = useState<RunStatus>({ id: 'idle', state: 'IDLE', iteration: 0 })
  const [isCaptureOpen, setCaptureOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([agentApi.getDevice(), agentApi.getWorkflow().catch(() => undefined)])
      .then(([health, remoteWorkflow]) => {
        if (cancelled) return
        setDevice(health)
        if (remoteWorkflow) setWorkflow(remoteWorkflow)
      })
      .catch(() => { if (!cancelled) setDevice(undefined) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    localStorage.setItem(LOCAL_WORKFLOW_KEY, JSON.stringify(workflow))
  }, [workflow])

  useEffect(() => {
    if (run.state !== 'RUNNING') return
    const timer = window.setInterval(() => {
      agentApi.getRunStatus().then(setRun).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run.state])

  const validation = useMemo(() => validateWorkflow(workflow), [workflow])
  const changeWorkflow = useCallback((next: WorkflowDocument) => setWorkflow(next), [])

  const saveWorkflow = async () => {
    if (!validation.valid) {
      setNotice(validation.issues[0])
      return
    }
    setIsSaving(true)
    try {
      const saved = await agentApi.saveWorkflow(workflow)
      setWorkflow(saved)
      setNotice('Đã lưu workflow xuống điện thoại')
    } catch {
      setNotice('Đã lưu bản nháp trên trình duyệt · Agent chưa kết nối')
    } finally {
      setIsSaving(false)
    }
  }

  const saveTemplate = async (upload: TemplateUpload) => {
    let record = upload.record
    try {
      record = await agentApi.uploadTemplate(upload)
      setNotice(`Đã lưu template “${record.name}” trên điện thoại`)
    } catch {
      setNotice(`Đã thêm “${record.name}” vào bản nháp · cần Agent để upload ảnh`)
    }
    setWorkflow((current) => ({
      ...current,
      templates: [...current.templates.filter((item) => item.id !== record.id), record],
      updatedAt: new Date().toISOString(),
    }))
  }

  const startRun = async () => {
    if (!validation.valid) {
      setNotice(validation.issues[0])
      return
    }
    try {
      await agentApi.saveWorkflow(workflow)
      setRun(await agentApi.startRun(workflow.id))
      setNotice('Workflow đã được chuyển xuống điện thoại')
    } catch (reason) {
      setNotice(reason instanceof Error ? `Không thể chạy: ${reason.message}` : 'Không thể kết nối Agent')
    }
  }

  const stopRun = async () => {
    try { setRun(await agentApi.stopRun()) } catch { setNotice('Không thể gửi lệnh dừng') }
  }

  const statusLabel = run.state === 'RUNNING' ? `ĐANG CHẠY · VÒNG ${run.iteration}` : run.state

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AI</div>
          <div><span>ROOTED ANDROID AUTOMATION</span><h1>Phone Studio</h1></div>
        </div>
        <div className="device-strip">
          <div className={`connection-dot ${device ? 'online' : ''}`} />
          <div><span>{device ? 'AGENT ONLINE' : 'OFFLINE DRAFT'}</span><strong>{device ? `${device.model} · Android ${device.androidVersion}` : 'Kết nối qua ADB port 8765'}</strong></div>
          {device ? <Wifi size={18} /> : <CloudOff size={18} />}
        </div>
        <div className="top-actions">
          <button className="toolbar-button" onClick={() => setCaptureOpen(true)}><Camera size={17} /> Lấy ảnh</button>
          <button className="toolbar-button" onClick={() => void saveWorkflow()} disabled={isSaving}><Save size={17} /> Lưu</button>
          {run.state === 'RUNNING' ? (
            <button className="run-button stop" onClick={() => void stopRun()}><CircleStop size={18} /> Dừng</button>
          ) : (
            <button className="run-button" onClick={() => void startRun()}><Play size={18} fill="currentColor" /> Chạy</button>
          )}
        </div>
      </header>

      <section className="status-rail">
        <div><Smartphone size={15} /><span>DISPLAY</span><strong>{device ? `${device.displayWidth} × ${device.displayHeight}` : '2608 × 1200'}</strong></div>
        <div><Cpu size={15} /><span>ROOT</span><strong className={device?.rootGranted ? 'good' : 'warn'}>{device ? (device.rootGranted ? 'KERNELSU GRANTED' : 'CẦN CẤP QUYỀN') : 'CHƯA KIỂM TRA'}</strong></div>
        <div><span>WORKFLOW</span><strong>{workflow.name} · r{workflow.revision}</strong></div>
        <div><span>VALIDATION</span><strong className={validation.valid ? 'good' : 'bad'}>{validation.valid ? 'SẴN SÀNG' : `${validation.issues.length} LỖI`}</strong></div>
        <div className="run-state"><span>RUN</span><strong data-state={run.state}>{statusLabel}</strong></div>
      </section>

      {notice && <button className="notice-bar" onClick={() => setNotice(undefined)}>{notice}<span>Đóng</span></button>}

      <WorkflowCanvas workflow={workflow} activeNodeId={run.currentNodeId} onChange={changeWorkflow} />

      <footer className="footer-strip">
        <span>AIPhone Studio v0.1</span>
        <span>{workflow.nodes.length} nodes · {workflow.edges.length} edges · {workflow.templates.length} templates</span>
        <span>Target: com.garena.game.kgvn / user 999</span>
      </footer>

      {isCaptureOpen && (
        <TemplateCapture capture={agentApi.captureScreenshot} onClose={() => setCaptureOpen(false)} onSave={saveTemplate} />
      )}
    </main>
  )
}
