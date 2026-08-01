import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Camera, CircleStop, CloudOff, Cpu, ListTree, Play, RefreshCw, Save, Smartphone, Usb, Workflow, X } from 'lucide-react'
import {
  agentApi,
  bridgeApi,
  getAgentDeviceSerial,
  hasAgentToken,
  isStandaloneStudio,
  setAgentDeviceSerial,
  setAgentToken,
  type AdbDevice,
  type AssetUpload,
  type DeviceHealth,
  type RunStatus,
} from './api/client'
import { createStarterWorkflow, normalizeWorkflow, validateWorkflow, type AssetRecord, type ImageAssetRecord, type UiSelectorAssetRecord, type WorkflowDocument, type WorkflowNode } from './contracts/workflow'
import { AssetLibrary } from './features/assets/AssetLibrary'
import { CaptureLab } from './features/capture/CaptureLab'
import { RunLogPanel } from './features/runs/RunLogPanel'
import { WorkflowCanvas } from './features/workflows/WorkflowCanvas'
import { WorkflowManager } from './features/workflows/WorkflowManager'
import { isAssetReferenced, removeAsset, uniqueWorkflowId, upsertAsset } from './features/workflows/workflowMutations'

const LOCAL_WORKSPACES_KEY = 'aiphone.workflows.v2'
const LEGACY_WORKFLOW_KEY = 'aiphone.workflow.v1'
const LOCAL_SELECTED_KEY = 'aiphone.selected-workflow'
const DESTRUCTIVE_NODE_TYPES = new Set(['CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE', 'FORCE_STOP_APP'])

function loadLocalWorkflows(): WorkflowDocument[] {
  try {
    const stored = localStorage.getItem(LOCAL_WORKSPACES_KEY)
    if (stored) {
      const workflows = (JSON.parse(stored) as unknown[]).map(normalizeWorkflow)
      if (workflows.length > 0) return workflows
    }
    const legacy = localStorage.getItem(LEGACY_WORKFLOW_KEY)
    if (legacy) return [normalizeWorkflow(JSON.parse(legacy))]
  } catch {
    // Fall through to a clean starter workflow.
  }
  return [createStarterWorkflow()]
}

export function App() {
  const standalone = useMemo(isStandaloneStudio, [])
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>(loadLocalWorkflows)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(() => localStorage.getItem(LOCAL_SELECTED_KEY) || loadLocalWorkflows()[0]?.id || 'default-workflow')
  const [workspace, setWorkspace] = useState<'STUDIO' | 'WORKFLOWS' | 'ASSETS'>('STUDIO')
  const [device, setDevice] = useState<DeviceHealth>()
  const [adbDevices, setAdbDevices] = useState<AdbDevice[]>([])
  const [selectedSerial, setSelectedSerial] = useState(getAgentDeviceSerial)
  const [run, setRun] = useState<RunStatus>({ id: 'idle', state: 'IDLE', iteration: 0 })
  const [isNodeTest, setIsNodeTest] = useState(false)
  const [isLogExpanded, setLogExpanded] = useState(false)
  const [captureTarget, setCaptureTarget] = useState<{ workflowId: string; initialImageAsset?: ImageAssetRecord }>()
  const [notice, setNotice] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [showDevices, setShowDevices] = useState(standalone && !selectedSerial)
  const [showPairing, setShowPairing] = useState(!standalone && !hasAgentToken())
  const [pairingInput, setPairingInput] = useState('')

  const workflow = workflows.find((candidate) => candidate.id === selectedWorkflowId) ?? workflows[0]
  const validation = useMemo(() => validateWorkflow(workflow), [workflow])
  const isPaired = hasAgentToken()

  const replaceWorkflow = useCallback((next: WorkflowDocument) => {
    setWorkflows((current) => current.map((candidate) => candidate.id === next.id ? next : candidate))
  }, [])

  const scanDevices = useCallback(async () => {
    setIsScanning(true)
    try { setAdbDevices(await bridgeApi.getDevices()) }
    catch (reason) { setNotice(reason instanceof Error ? `Không thể quét USB: ${reason.message}` : 'Không thể quét thiết bị USB') }
    finally { setIsScanning(false) }
  }, [])

  useEffect(() => { if (standalone) void scanDevices() }, [scanDevices, standalone])

  useEffect(() => {
    if ((standalone && !selectedSerial) || !hasAgentToken()) {
      setDevice(undefined)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const [health, summaries] = await Promise.all([agentApi.getDevice(), agentApi.getWorkflows()])
        const remoteWorkflows = await Promise.all(summaries.map((summary) => agentApi.getWorkflow(summary.id)))
        if (cancelled) return
        const normalized = remoteWorkflows.map(normalizeWorkflow)
        setDevice(health)
        setWorkflows(normalized.length ? normalized : [createStarterWorkflow()])
        setSelectedWorkflowId((current) => normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? 'default-workflow')
      } catch {
        if (cancelled) return
        setDevice(undefined)
        setShowPairing(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [connectionRevision, selectedSerial, standalone])

  useEffect(() => {
    localStorage.setItem(LOCAL_WORKSPACES_KEY, JSON.stringify(workflows))
    localStorage.setItem(LOCAL_SELECTED_KEY, selectedWorkflowId)
  }, [selectedWorkflowId, workflows])

  useEffect(() => {
    if (run.state !== 'RUNNING') return
    const timer = window.setInterval(() => {
      agentApi.getRunStatus().then((status) => { setRun(status); if (status.state !== 'RUNNING') setIsNodeTest(false) }).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run.state])

  useEffect(() => { if (run.state === 'FAILED') setLogExpanded(true) }, [run.state])

  const changeWorkflow = useCallback((next: WorkflowDocument) => replaceWorkflow(next), [replaceWorkflow])

  const persistWorkflow = async (next: WorkflowDocument, successMessage?: string): Promise<boolean> => {
    replaceWorkflow(next)
    try {
      const saved = await agentApi.saveWorkflow(next)
      replaceWorkflow(normalizeWorkflow(saved))
      if (successMessage) setNotice(successMessage)
      return true
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Agent chưa kết nối'
      if (successMessage) setNotice(`${successMessage} trong bản nháp · ${detail}`)
      return false
    }
  }

  const saveWorkflow = async () => {
    if (!validation.valid) return setNotice(validation.issues[0])
    setIsSaving(true)
    try { await persistWorkflow(workflow, 'Đã lưu workflow xuống điện thoại') }
    finally { setIsSaving(false) }
  }

  const saveImageAsset = async (upload: AssetUpload) => {
    let record = upload.record
    try { record = await agentApi.uploadAsset(upload) }
    catch { setNotice(`Đã cập nhật “${record.name}” trong bản nháp · cần Agent để lưu PNG`) }
    const owner = workflows.find((item) => item.id === record.workflowId)!
    const next = upsertAsset(owner, record)
    await persistWorkflow(next, `Đã lưu Asset “${record.name}”`)
    setCaptureTarget(undefined)
  }

  const saveSelectorAsset = async (asset: UiSelectorAssetRecord, createNode: boolean) => {
    const owner = workflows.find((item) => item.id === asset.workflowId)!
    const node: WorkflowNode = { id: `tap_text-${crypto.randomUUID().slice(0, 8)}`, type: 'TAP_TEXT', position: { x: 300, y: 220 }, config: { assetId: asset.id, timeoutMs: 10000, pollIntervalMs: 400 } }
    const next = { ...owner, assets: [...owner.assets.filter((item) => item.id !== asset.id), asset], nodes: createNode ? [...owner.nodes, node] : owner.nodes, revision: owner.revision + 1, updatedAt: new Date().toISOString() }
    await persistWorkflow(next, `Đã lưu UI selector “${asset.name}”${createNode ? ' và thêm node' : ''}`)
    setCaptureTarget(undefined)
  }

  const createWorkflow = async (name: string) => {
    const next = createStarterWorkflow(name, uniqueWorkflowId(name, workflows))
    setWorkflows((current) => [...current, next])
    setSelectedWorkflowId(next.id)
    setWorkspace('STUDIO')
    try { replaceWorkflow(normalizeWorkflow(await agentApi.createWorkflow(next))); setNotice(`Đã tạo workflow “${name}”`) }
    catch { setNotice(`Đã tạo workflow “${name}” trong bản nháp`) }
  }

  const renameWorkflow = async (id: string, name: string) => {
    const current = workflows.find((item) => item.id === id)!
    await persistWorkflow({ ...current, name, revision: current.revision + 1, updatedAt: new Date().toISOString() }, `Đã đổi tên workflow thành “${name}”`)
  }

  const deleteWorkflow = async (id: string) => {
    if (workflows.length === 1 || !window.confirm('Xóa workflow và toàn bộ Asset của nó?')) return
    try { await agentApi.deleteWorkflow(id) } catch { /* Local draft deletion remains useful offline. */ }
    const remaining = workflows.filter((item) => item.id !== id)
    setWorkflows(remaining)
    if (selectedWorkflowId === id) setSelectedWorkflowId(remaining[0].id)
    setNotice('Đã xóa workflow')
  }

  const renameAsset = async (asset: AssetRecord, name: string) => {
    const owner = workflows.find((item) => item.id === asset.workflowId)!
    const updated = { ...asset, name, updatedAt: new Date().toISOString() } as AssetRecord
    await persistWorkflow({ ...owner, assets: owner.assets.map((item) => item.id === asset.id ? updated : item), revision: owner.revision + 1, updatedAt: new Date().toISOString() }, `Đã đổi tên Asset thành “${name}”`)
  }

  const deleteAsset = async (asset: AssetRecord) => {
    const owner = workflows.find((item) => item.id === asset.workflowId)!
    if (isAssetReferenced(owner, asset.id)) return setNotice(`Asset “${asset.name}” đang được node sử dụng`)
    if (!window.confirm(`Xóa Asset “${asset.name}”?`)) return
    const persisted = await persistWorkflow(removeAsset(owner, asset.id), `Đã xóa Asset “${asset.name}”`)
    if (persisted && asset.type === 'IMAGE') await agentApi.deleteAssetFile(asset.workflowId, asset.id).catch(() => undefined)
  }

  const startRun = async () => {
    if (!validation.valid) return setNotice(validation.issues[0])
    try { setIsNodeTest(false); await agentApi.saveWorkflow(workflow); setRun(await agentApi.startRun(workflow.id)); setNotice('Workflow đã được chuyển xuống điện thoại') }
    catch (reason) { setNotice(reason instanceof Error ? `Không thể chạy: ${reason.message}` : 'Không thể kết nối Agent') }
  }

  const playNode = async (node: WorkflowNode) => {
    if (DESTRUCTIVE_NODE_TYPES.has(node.type) && !window.confirm(`Node “${node.id}” có thể thay đổi dữ liệu ứng dụng. Tiếp tục chạy thử?`)) return
    try { await agentApi.saveWorkflow(workflow); setIsNodeTest(true); setRun(await agentApi.startNodeTest(workflow.id, node.id)); setNotice(`Đang chạy thử duy nhất node “${node.id}”`) }
    catch (reason) { setIsNodeTest(false); setNotice(reason instanceof Error ? `Không thể chạy thử node: ${reason.message}` : 'Không thể kết nối Agent') }
  }

  const selectDevice = (serial: string) => {
    setAgentDeviceSerial(serial); setSelectedSerial(serial); setDevice(undefined); setRun({ id: 'idle', state: 'IDLE', iteration: 0 }); setShowDevices(false); setShowPairing(!hasAgentToken()); setConnectionRevision((value) => value + 1)
  }
  const connectWithToken = () => { setAgentToken(pairingInput); setPairingInput(''); setShowPairing(false); setConnectionRevision((value) => value + 1) }
  const stopRun = async () => { try { setRun(await agentApi.stopRun()) } catch { setNotice('Không thể gửi lệnh dừng') } }

  const statusLabel = run.state === 'RUNNING' ? (isNodeTest ? 'ĐANG TEST NODE' : `ĐANG CHẠY · VÒNG ${run.iteration}`) : run.state
  const selectedAdbDevice = adbDevices.find((candidate) => candidate.serial === selectedSerial)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">AI</div><div><span>ROOTED ANDROID AUTOMATION</span><h1>Phone Studio</h1></div></div>
        <nav className="workspace-nav" aria-label="Khu vực làm việc"><button className={workspace === 'STUDIO' ? 'active' : ''} onClick={() => setWorkspace('STUDIO')}><ListTree size={16} /> Studio</button><button className={workspace === 'WORKFLOWS' ? 'active' : ''} onClick={() => setWorkspace('WORKFLOWS')}><Workflow size={16} /> Workflows</button><button className={workspace === 'ASSETS' ? 'active' : ''} onClick={() => setWorkspace('ASSETS')}><Boxes size={16} /> Assets</button></nav>
        <button className="device-strip" onClick={() => { if (standalone) { setShowDevices(true); void scanDevices() } else setShowPairing(true) }} title={standalone ? 'Chọn điện thoại USB' : 'Ghép nối Android Agent'}><div className={`connection-dot ${device ? 'online' : ''}`} /><div><span>{device ? 'AGENT ONLINE' : (selectedSerial ? 'USB ĐÃ CHỌN' : 'CHƯA CHỌN MÁY')}</span><strong>{device ? `${device.model} · Android ${device.androidVersion}` : (selectedAdbDevice?.model ? `${selectedAdbDevice.model} · ${selectedSerial}` : selectedSerial || 'Bấm để quét USB')}</strong></div>{selectedSerial ? <Usb size={18} /> : <CloudOff size={18} />}</button>
        <div className="top-actions"><button className="toolbar-button" onClick={() => setCaptureTarget({ workflowId: workflow.id })} disabled={(standalone && !selectedSerial) || !isPaired}><Camera size={17} /> Capture Lab</button><button className="toolbar-button" onClick={() => void saveWorkflow()} disabled={isSaving}><Save size={17} /> Lưu</button>{run.state === 'RUNNING' ? <button className="run-button stop" onClick={() => void stopRun()}><CircleStop size={18} /> Dừng</button> : <button className="run-button" onClick={() => void startRun()} disabled={(standalone && !selectedSerial) || !isPaired}><Play size={18} fill="currentColor" /> Chạy</button>}</div>
      </header>

      <section className="status-rail"><div><Smartphone size={15} /><span>DISPLAY</span><strong>{device ? `${device.displayWidth} × ${device.displayHeight}` : '2608 × 1200'}</strong></div><div><Cpu size={15} /><span>ROOT / INSPECTOR</span><strong className={device?.rootGranted ? 'good' : 'warn'}>{device ? `${device.rootGranted ? 'KERNELSU' : 'NO ROOT'} · ${device.accessibilityReady ? 'TEXT READY' : 'TEXT AUTO'}` : 'CHƯA KIỂM TRA'}</strong></div><div><span>WORKFLOW</span><strong>{workflow.name} · r{workflow.revision}</strong></div><div><span>VALIDATION</span><strong className={validation.valid ? 'good' : 'bad'}>{validation.valid ? 'SẴN SÀNG' : `${validation.issues.length} LỖI`}</strong></div><div className="run-state"><span>RUN</span><strong data-state={run.state}>{statusLabel}</strong></div></section>
      {notice && <button className="notice-bar" onClick={() => setNotice(undefined)}>{notice}<span>Đóng</span></button>}
      <RunLogPanel run={run} expanded={isLogExpanded} onToggle={() => setLogExpanded((value) => !value)} />

      {workspace === 'STUDIO' && <WorkflowCanvas workflow={workflow} activeNodeId={run.currentNodeId} onChange={changeWorkflow} onPlayNode={(node) => void playNode(node)} isNodeTestRunning={!isPaired || (isNodeTest && run.state === 'RUNNING')} />}
      {workspace === 'WORKFLOWS' && <WorkflowManager workflows={workflows} selectedId={workflow.id} onSelect={(id) => { setSelectedWorkflowId(id); setWorkspace('STUDIO') }} onCreate={(name) => void createWorkflow(name)} onRename={(id, name) => void renameWorkflow(id, name)} onDelete={(id) => void deleteWorkflow(id)} />}
      {workspace === 'ASSETS' && <AssetLibrary workflows={workflows} selectedWorkflowId={workflow.id} onSelectWorkflow={setSelectedWorkflowId} onCapture={(workflowId) => setCaptureTarget({ workflowId })} onReplace={(asset) => setCaptureTarget({ workflowId: asset.workflowId, initialImageAsset: asset })} onRename={(asset, name) => void renameAsset(asset, name)} onDelete={(asset) => void deleteAsset(asset)} />}

      <footer className="footer-strip"><span>AIPhone Studio v0.2</span><span>{workflow.nodes.length} nodes · {workflow.edges.length} edges · {workflow.assets.length} Assets</span><span>{selectedSerial ? `USB: ${selectedSerial}` : 'Target: chưa chọn điện thoại'}</span></footer>

      {captureTarget && <CaptureLab workflowId={captureTarget.workflowId} initialImageAsset={captureTarget.initialImageAsset} capture={agentApi.captureScreenshot} inspect={agentApi.getUiHierarchy} onClose={() => setCaptureTarget(undefined)} onSaveImage={saveImageAsset} onSaveSelector={saveSelectorAsset} />}
      {showDevices && standalone && <div className="modal-backdrop device-backdrop"><section className="device-card" role="dialog" aria-modal="true" aria-labelledby="device-title"><header><div><span>USB / ADB</span><h2 id="device-title">Chọn điện thoại chạy workflow</h2></div><button className="icon-button" onClick={() => setShowDevices(false)} aria-label="Đóng"><X size={18} /></button></header><p>Studio chỉ gửi lệnh tới máy được chọn. Hãy bật USB debugging và chấp nhận khóa RSA trên điện thoại.</p><div className="device-list">{adbDevices.length === 0 && <div className="device-empty"><Usb size={24} /><strong>Chưa tìm thấy thiết bị</strong><span>Kiểm tra cáp USB rồi bấm Quét lại.</span></div>}{adbDevices.map((candidate) => <button key={candidate.serial} className={`device-option ${candidate.serial === selectedSerial ? 'selected' : ''}`} disabled={candidate.state !== 'device'} onClick={() => selectDevice(candidate.serial)}><Smartphone size={20} /><span><strong>{candidate.model || candidate.serial}</strong><small>{candidate.serial}</small></span><em data-state={candidate.state}>{candidate.state === 'device' ? 'Sẵn sàng' : candidate.state}</em></button>)}</div><footer><button className="secondary-button" onClick={() => void scanDevices()} disabled={isScanning}><RefreshCw size={16} className={isScanning ? 'spin' : ''} /> {isScanning ? 'Đang quét...' : 'Quét lại'}</button></footer></section></div>}
      {showPairing && <div className="modal-backdrop pairing-backdrop"><section className="pairing-card" role="dialog" aria-modal="true" aria-labelledby="pairing-title"><span>SECURE ROOT CHANNEL</span><h2 id="pairing-title">Ghép nối với Android Agent</h2><p>Nhập pairing token hiển thị trong app AIPhone Agent. Token chỉ tồn tại trong phiên trình duyệt này.</p><input id="pairing-token" name="pairing-token" aria-label="Pairing token" autoFocus value={pairingInput} onChange={(event) => setPairingInput(event.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx" /><div><button className="secondary-button" onClick={() => setShowPairing(false)}>Dùng bản nháp offline</button><button className="primary-button" disabled={pairingInput.replace(/\s/g, '').length < 16} onClick={connectWithToken}>Kết nối Agent</button></div></section></div>}
    </main>
  )
}
