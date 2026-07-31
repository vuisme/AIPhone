import { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, CircleStop, CloudOff, Cpu, Play, RefreshCw, Save, Smartphone, Usb, X } from 'lucide-react'
import {
  agentApi,
  bridgeApi,
  getAgentDeviceSerial,
  hasAgentToken,
  isStandaloneStudio,
  setAgentDeviceSerial,
  setAgentToken,
  type AdbDevice,
  type DeviceHealth,
  type RunStatus,
  type TemplateUpload,
} from './api/client'
import { createStarterWorkflow, validateWorkflow, type WorkflowDocument, type WorkflowNode } from './contracts/workflow'
import { TemplateCapture } from './features/templates/TemplateCapture'
import { WorkflowCanvas } from './features/workflows/WorkflowCanvas'

const LOCAL_WORKFLOW_KEY = 'aiphone.workflow.v1'
const DESTRUCTIVE_NODE_TYPES = new Set(['CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE', 'FORCE_STOP_APP'])

function loadLocalWorkflow(): WorkflowDocument {
  try {
    const stored = localStorage.getItem(LOCAL_WORKFLOW_KEY)
    return stored ? JSON.parse(stored) as WorkflowDocument : createStarterWorkflow()
  } catch {
    return createStarterWorkflow()
  }
}

export function App() {
  const standalone = useMemo(isStandaloneStudio, [])
  const [workflow, setWorkflow] = useState<WorkflowDocument>(loadLocalWorkflow)
  const [device, setDevice] = useState<DeviceHealth>()
  const [adbDevices, setAdbDevices] = useState<AdbDevice[]>([])
  const [selectedSerial, setSelectedSerial] = useState(getAgentDeviceSerial)
  const [run, setRun] = useState<RunStatus>({ id: 'idle', state: 'IDLE', iteration: 0 })
  const [isNodeTest, setIsNodeTest] = useState(false)
  const [isCaptureOpen, setCaptureOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [showDevices, setShowDevices] = useState(standalone && !selectedSerial)
  const [showPairing, setShowPairing] = useState(!standalone && !hasAgentToken())
  const [pairingInput, setPairingInput] = useState('')

  const scanDevices = useCallback(async () => {
    setIsScanning(true)
    try {
      setAdbDevices(await bridgeApi.getDevices())
    } catch (reason) {
      setNotice(reason instanceof Error ? `Không thể quét USB: ${reason.message}` : 'Không thể quét thiết bị USB')
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (standalone) void scanDevices()
  }, [scanDevices, standalone])

  useEffect(() => {
    if ((standalone && !selectedSerial) || !hasAgentToken()) {
      setDevice(undefined)
      return
    }
    let cancelled = false
    Promise.all([agentApi.getDevice(), agentApi.getWorkflow().catch(() => undefined)])
      .then(([health, remoteWorkflow]) => {
        if (cancelled) return
        setDevice(health)
        if (remoteWorkflow) setWorkflow(remoteWorkflow)
      })
      .catch(() => {
        if (cancelled) return
        setDevice(undefined)
        setShowPairing(true)
      })
    return () => { cancelled = true }
  }, [connectionRevision, selectedSerial, standalone])

  useEffect(() => {
    localStorage.setItem(LOCAL_WORKFLOW_KEY, JSON.stringify(workflow))
  }, [workflow])

  useEffect(() => {
    if (run.state !== 'RUNNING') return
    const timer = window.setInterval(() => {
      agentApi.getRunStatus().then((status) => {
        setRun(status)
        if (status.state !== 'RUNNING') setIsNodeTest(false)
      }).catch(() => undefined)
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
      setIsNodeTest(false)
      await agentApi.saveWorkflow(workflow)
      setRun(await agentApi.startRun(workflow.id))
      setNotice('Workflow đã được chuyển xuống điện thoại')
    } catch (reason) {
      setNotice(reason instanceof Error ? `Không thể chạy: ${reason.message}` : 'Không thể kết nối Agent')
    }
  }

  const playNode = async (node: WorkflowNode) => {
    if (DESTRUCTIVE_NODE_TYPES.has(node.type)) {
      const confirmed = window.confirm(`Node “${node.id}” có thể thay đổi dữ liệu ứng dụng. Tiếp tục chạy thử?`)
      if (!confirmed) return
    }
    try {
      await agentApi.saveWorkflow(workflow)
      setIsNodeTest(true)
      setRun(await agentApi.startNodeTest(workflow.id, node.id))
      setNotice(`Đang chạy thử duy nhất node “${node.id}”`)
    } catch (reason) {
      setIsNodeTest(false)
      setNotice(reason instanceof Error ? `Không thể chạy thử node: ${reason.message}` : 'Không thể kết nối Agent')
    }
  }

  const selectDevice = (serial: string) => {
    setAgentDeviceSerial(serial)
    setSelectedSerial(serial)
    setDevice(undefined)
    setRun({ id: 'idle', state: 'IDLE', iteration: 0 })
    setShowDevices(false)
    setShowPairing(!hasAgentToken())
    setConnectionRevision((value) => value + 1)
  }

  const connectWithToken = () => {
    setAgentToken(pairingInput)
    setPairingInput('')
    setShowPairing(false)
    setConnectionRevision((value) => value + 1)
  }

  const stopRun = async () => {
    try { setRun(await agentApi.stopRun()) } catch { setNotice('Không thể gửi lệnh dừng') }
  }

  const statusLabel = run.state === 'RUNNING'
    ? (isNodeTest ? 'ĐANG TEST NODE' : `ĐANG CHẠY · VÒNG ${run.iteration}`)
    : run.state
  const selectedAdbDevice = adbDevices.find((candidate) => candidate.serial === selectedSerial)
  const isPaired = hasAgentToken()

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AI</div>
          <div><span>ROOTED ANDROID AUTOMATION</span><h1>Phone Studio</h1></div>
        </div>
        <button className="device-strip" onClick={() => {
          if (standalone) {
            setShowDevices(true)
            void scanDevices()
          } else {
            setShowPairing(true)
          }
        }} title={standalone ? 'Chọn điện thoại USB' : 'Ghép nối Android Agent'}>
          <div className={`connection-dot ${device ? 'online' : ''}`} />
          <div><span>{device ? 'AGENT ONLINE' : (selectedSerial ? 'USB ĐÃ CHỌN' : 'CHƯA CHỌN MÁY')}</span><strong>{device ? `${device.model} · Android ${device.androidVersion}` : (selectedAdbDevice?.model ? `${selectedAdbDevice.model} · ${selectedSerial}` : selectedSerial || 'Bấm để quét USB')}</strong></div>
          {selectedSerial ? <Usb size={18} /> : <CloudOff size={18} />}
        </button>
        <div className="top-actions">
          <button className="toolbar-button" onClick={() => setCaptureOpen(true)} disabled={(standalone && !selectedSerial) || !isPaired}><Camera size={17} /> Lấy ảnh</button>
          <button className="toolbar-button" onClick={() => void saveWorkflow()} disabled={isSaving}><Save size={17} /> Lưu</button>
          {run.state === 'RUNNING' ? (
            <button className="run-button stop" onClick={() => void stopRun()}><CircleStop size={18} /> Dừng</button>
          ) : (
            <button className="run-button" onClick={() => void startRun()} disabled={(standalone && !selectedSerial) || !isPaired}><Play size={18} fill="currentColor" /> Chạy</button>
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

      <WorkflowCanvas workflow={workflow} activeNodeId={run.currentNodeId} onChange={changeWorkflow} onPlayNode={(node) => void playNode(node)} isNodeTestRunning={!isPaired || (isNodeTest && run.state === 'RUNNING')} />

      <footer className="footer-strip">
        <span>AIPhone Studio v0.1</span>
        <span>{workflow.nodes.length} nodes · {workflow.edges.length} edges · {workflow.templates.length} templates</span>
        <span>{selectedSerial ? `USB: ${selectedSerial}` : 'Target: chưa chọn điện thoại'}</span>
      </footer>

      {isCaptureOpen && (
        <TemplateCapture capture={agentApi.captureScreenshot} onClose={() => setCaptureOpen(false)} onSave={saveTemplate} />
      )}

      {showDevices && standalone && (
        <div className="modal-backdrop device-backdrop">
          <section className="device-card" role="dialog" aria-modal="true" aria-labelledby="device-title">
            <header>
              <div><span>USB / ADB</span><h2 id="device-title">Chọn điện thoại chạy workflow</h2></div>
              <button className="icon-button" onClick={() => setShowDevices(false)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <p>Studio chỉ gửi lệnh tới máy được chọn. Hãy bật USB debugging và chấp nhận khóa RSA trên điện thoại.</p>
            <div className="device-list">
              {adbDevices.length === 0 && <div className="device-empty"><Usb size={24} /><strong>Chưa tìm thấy thiết bị</strong><span>Kiểm tra cáp USB rồi bấm Quét lại.</span></div>}
              {adbDevices.map((candidate) => (
                <button key={candidate.serial} className={`device-option ${candidate.serial === selectedSerial ? 'selected' : ''}`} disabled={candidate.state !== 'device'} onClick={() => selectDevice(candidate.serial)}>
                  <Smartphone size={20} />
                  <span><strong>{candidate.model || candidate.serial}</strong><small>{candidate.serial}</small></span>
                  <em data-state={candidate.state}>{candidate.state === 'device' ? 'Sẵn sàng' : candidate.state}</em>
                </button>
              ))}
            </div>
            <footer>
              <button className="secondary-button" onClick={() => void scanDevices()} disabled={isScanning}><RefreshCw size={16} className={isScanning ? 'spin' : ''} /> {isScanning ? 'Đang quét...' : 'Quét lại'}</button>
            </footer>
          </section>
        </div>
      )}

      {showPairing && (
        <div className="modal-backdrop pairing-backdrop">
          <section className="pairing-card" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
            <span>SECURE ROOT CHANNEL</span>
            <h2 id="pairing-title">Ghép nối với Android Agent</h2>
            <p>Nhập pairing token hiển thị trong app AIPhone Agent. Token chỉ tồn tại trong phiên trình duyệt này.</p>
            <input id="pairing-token" name="pairing-token" aria-label="Pairing token" autoFocus value={pairingInput} onChange={(event) => setPairingInput(event.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx" />
            <div>
              <button className="secondary-button" onClick={() => setShowPairing(false)}>Dùng bản nháp offline</button>
              <button className="primary-button" disabled={pairingInput.replace(/\s/g, '').length < 16} onClick={connectWithToken}>Kết nối Agent</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
