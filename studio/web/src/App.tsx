import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Camera, CircleStop, CloudOff, Cpu, ListTree, Monitor, Play, RefreshCw, Save, Smartphone, Usb, Workflow, X } from 'lucide-react'
import {
  agentApi,
  bridgeApi,
  getAgentDeviceSerial,
  hasAgentToken,
  isStandaloneStudio,
  projectApi,
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
import { blobToDataUrl, deployWorkflow, type DeploymentDependencies } from './features/fleet/deployment'
import { FleetDeployBar, type FleetDeviceProgress } from './features/fleet/FleetDeployBar'
import { LiveViewPanel } from './features/live/LiveViewPanel'
import { RunLogPanel } from './features/runs/RunLogPanel'
import { WorkflowCanvas } from './features/workflows/WorkflowCanvas'
import { WorkflowManager } from './features/workflows/WorkflowManager'
import { isAssetReferenced, removeAsset, uniqueWorkflowId, upsertAsset } from './features/workflows/workflowMutations'

const LOCAL_WORKSPACES_KEY = 'aiphone.workflows.v2'
const LEGACY_WORKFLOW_KEY = 'aiphone.workflow.v1'
const LOCAL_SELECTED_KEY = 'aiphone.selected-workflow'
const DESTRUCTIVE_NODE_TYPES = new Set(['CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE', 'FORCE_STOP_APP'])

const deploymentDependencies: DeploymentDependencies = {
  getInventory: (workflowId, serial) => agentApi.getWorkflowInventory(workflowId, serial),
  readAsset: (workflowId, assetId) => projectApi.getAssetImage(workflowId, assetId),
  uploadAsset: (upload, serial) => agentApi.uploadAsset(upload, serial),
  saveWorkflow: (workflow, serial) => agentApi.saveWorkflow(workflow, serial),
  startRun: (workflowId, serial) => agentApi.startRun(workflowId, serial),
}

async function importDeviceWorkflows(serial: string): Promise<WorkflowDocument[]> {
  const summaries = await agentApi.getWorkflows(serial)
  const imported: WorkflowDocument[] = []
  for (const summary of summaries) {
    let workflow = normalizeWorkflow(await agentApi.getWorkflow(summary.id, serial))
    await projectApi.saveWorkflow(workflow)
    for (const asset of workflow.assets) {
      if (asset.type !== 'IMAGE') continue
      const image = await agentApi.getAssetImage(workflow.id, asset.id, serial)
      const record = await projectApi.uploadAsset({ record: asset, imageBase64: await blobToDataUrl(image) })
      workflow = { ...workflow, assets: workflow.assets.map((item) => item.id === record.id ? record : item) }
    }
    workflow = normalizeWorkflow(await projectApi.saveWorkflow(workflow))
    imported.push(workflow)
  }
  return imported
}

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
  const [targetSerials, setTargetSerials] = useState<string[]>(() => getAgentDeviceSerial() ? [getAgentDeviceSerial()] : [])
  const [fleetProgress, setFleetProgress] = useState<Record<string, FleetDeviceProgress>>({})
  const [isFleetBusy, setFleetBusy] = useState(false)
  const [hostIsEmpty, setHostIsEmpty] = useState<boolean>()
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
  const [showLiveView, setShowLiveView] = useState(false)
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
    if (!standalone) return
    let cancelled = false
    const loadCanonical = async () => {
      try {
        const summaries = await projectApi.getWorkflows()
        const stored = await Promise.all(summaries.map((summary) => projectApi.getWorkflow(summary.id)))
        if (cancelled) return
        const normalized = stored.map(normalizeWorkflow)
        setHostIsEmpty(normalized.length === 0)
        if (normalized.length > 0) {
          setWorkflows(normalized)
          setSelectedWorkflowId((current) => normalized.some((item) => item.id === current) ? current : normalized[0].id)
        }
      } catch (reason) {
        if (!cancelled) setNotice(reason instanceof Error ? `Kho Studio Host lỗi: ${reason.message}` : 'Không thể mở kho Studio Host')
      }
    }
    void loadCanonical()
    return () => { cancelled = true }
  }, [standalone])

  useEffect(() => {
    if ((standalone && (!selectedSerial || hostIsEmpty === undefined)) || !hasAgentToken()) {
      setDevice(undefined)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const health = await agentApi.getDevice(selectedSerial)
        if (cancelled) return
        setDevice(health)
        if (standalone && hostIsEmpty) {
          const imported = await importDeviceWorkflows(selectedSerial)
          if (cancelled) return
          if (imported.length > 0) {
            setWorkflows(imported)
            setSelectedWorkflowId(imported[0].id)
          }
          setHostIsEmpty(false)
          setNotice(`Đã nhập ${imported.length} workflow và Asset từ điện thoại vào kho PC`)
        } else if (!standalone) {
          const summaries = await agentApi.getWorkflows()
          const remoteWorkflows = await Promise.all(summaries.map((summary) => agentApi.getWorkflow(summary.id)))
          const normalized = remoteWorkflows.map(normalizeWorkflow)
          setWorkflows(normalized.length ? normalized : [createStarterWorkflow()])
          setSelectedWorkflowId((current) => normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? 'default-workflow')
        }
      } catch {
        if (cancelled) return
        setDevice(undefined)
        setShowPairing(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [connectionRevision, hostIsEmpty, selectedSerial, standalone])

  useEffect(() => {
    localStorage.setItem(LOCAL_WORKSPACES_KEY, JSON.stringify(workflows))
    localStorage.setItem(LOCAL_SELECTED_KEY, selectedWorkflowId)
  }, [selectedWorkflowId, workflows])

  useEffect(() => {
    if (run.state !== 'RUNNING') return
    const timer = window.setInterval(() => {
      agentApi.getRunStatus(selectedSerial).then((status) => { setRun(status); if (status.state !== 'RUNNING') setIsNodeTest(false) }).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run.state, selectedSerial])

  useEffect(() => {
    const running = Object.entries(fleetProgress).filter(([, value]) => value.state === 'RUNNING').map(([serial]) => serial)
    if (running.length === 0) return
    const timer = window.setInterval(() => {
      void Promise.all(running.map(async (serial) => {
        try {
          const status = await agentApi.getRunStatus(serial)
          setFleetProgress((current) => ({ ...current, [serial]: { state: status.state, message: status.message, run: status } }))
          if (serial === selectedSerial) setRun(status)
        } catch (reason) {
          setFleetProgress((current) => ({ ...current, [serial]: { state: 'FAILED', message: reason instanceof Error ? reason.message : 'Mất kết nối' } }))
        }
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [fleetProgress, selectedSerial])

  useEffect(() => { if (run.state === 'FAILED') setLogExpanded(true) }, [run.state])

  const changeWorkflow = useCallback((next: WorkflowDocument) => replaceWorkflow(next), [replaceWorkflow])

  const persistWorkflow = async (next: WorkflowDocument, successMessage?: string): Promise<boolean> => {
    replaceWorkflow(next)
    try {
      const saved = standalone ? await projectApi.saveWorkflow(next) : await agentApi.saveWorkflow(next)
      replaceWorkflow(normalizeWorkflow(saved))
      if (successMessage) setNotice(successMessage)
      return true
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Không thể lưu kho canonical'
      if (successMessage) setNotice(`${successMessage} trong bản nháp · ${detail}`)
      return false
    }
  }

  const saveWorkflow = async () => {
    if (!validation.valid) return setNotice(validation.issues[0])
    setIsSaving(true)
    try { await persistWorkflow(workflow, standalone ? 'Đã lưu workflow vào kho PC' : 'Đã lưu workflow xuống điện thoại') }
    finally { setIsSaving(false) }
  }

  const saveImageAsset = async (upload: AssetUpload) => {
    let record = upload.record
    try {
      if (standalone) {
        const owner = workflows.find((item) => item.id === record.workflowId)!
        await projectApi.saveWorkflow(owner)
        record = await projectApi.uploadAsset(upload)
      } else {
        record = await agentApi.uploadAsset(upload)
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? `Không thể lưu PNG: ${reason.message}` : 'Không thể lưu PNG Asset')
      return
    }
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
    try { replaceWorkflow(normalizeWorkflow(standalone ? await projectApi.createWorkflow(next) : await agentApi.createWorkflow(next))); setNotice(`Đã tạo workflow “${name}”`) }
    catch { setNotice(`Đã tạo workflow “${name}” trong bản nháp`) }
  }

  const renameWorkflow = async (id: string, name: string) => {
    const current = workflows.find((item) => item.id === id)!
    await persistWorkflow({ ...current, name, revision: current.revision + 1, updatedAt: new Date().toISOString() }, `Đã đổi tên workflow thành “${name}”`)
  }

  const deleteWorkflow = async (id: string) => {
    if (workflows.length === 1 || !window.confirm('Xóa workflow và toàn bộ Asset của nó?')) return
    try { if (standalone) await projectApi.deleteWorkflow(id); else await agentApi.deleteWorkflow(id) } catch { /* Local draft deletion remains useful offline. */ }
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
    if (persisted && asset.type === 'IMAGE') {
      if (standalone) await projectApi.deleteAssetFile(asset.workflowId, asset.id).catch(() => undefined)
      else await agentApi.deleteAssetFile(asset.workflowId, asset.id).catch(() => undefined)
    }
  }

  const deployToFleet = async (startAfterDeploy: boolean) => {
    if (!validation.valid) return setNotice(validation.issues[0])
    const serials = standalone ? targetSerials : [selectedSerial].filter(Boolean)
    if (serials.length === 0) return setNotice('Chưa chọn điện thoại đích')
    setFleetBusy(true)
    setIsNodeTest(false)
    try {
      if (standalone) await projectApi.saveWorkflow(workflow)
    } catch (reason) {
      setFleetBusy(false)
      return setNotice(reason instanceof Error ? `Không thể lưu workflow canonical: ${reason.message}` : 'Không thể lưu workflow canonical')
    }
    setFleetProgress((current) => ({ ...current, ...Object.fromEntries(serials.map((serial) => [serial, { state: 'SYNCING' as const, message: 'Đang so sánh Asset...' }])) }))
    const results = await Promise.allSettled(serials.map(async (serial) => {
      if (!hasAgentToken(serial)) throw new Error('Chưa có pairing token cho máy này')
      let result
      if (standalone) {
        result = await deployWorkflow(workflow, serial, deploymentDependencies, startAfterDeploy)
      } else {
        await agentApi.saveWorkflow(workflow, serial)
        result = { uploadedAssetIds: [], run: startAfterDeploy ? await agentApi.startRun(workflow.id, serial) : undefined }
      }
      const state = result.run?.state === 'RUNNING' ? 'RUNNING' : 'READY'
      setFleetProgress((current) => ({ ...current, [serial]: { state, message: result.uploadedAssetIds.length ? `Đã tải ${result.uploadedAssetIds.length} Asset` : 'Đã đồng bộ', run: result.run } }))
      if (serial === selectedSerial && result.run) setRun(result.run)
      return result
    }))
    const failed = results.filter((result) => result.status === 'rejected').length
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const serial = serials[index]
        setFleetProgress((current) => ({ ...current, [serial]: { state: 'FAILED', message: result.reason instanceof Error ? result.reason.message : 'Đồng bộ thất bại' } }))
      }
    })
    setNotice(failed ? `${serials.length - failed}/${serials.length} máy hoàn tất; ${failed} máy lỗi` : `${serials.length} máy đã ${startAfterDeploy ? 'đồng bộ và bắt đầu chạy' : 'đồng bộ'}`)
    setFleetBusy(false)
  }

  const startRun = async () => deployToFleet(true)

  const playNode = async (node: WorkflowNode) => {
    if (DESTRUCTIVE_NODE_TYPES.has(node.type) && !window.confirm(`Node “${node.id}” có thể thay đổi dữ liệu ứng dụng. Tiếp tục chạy thử?`)) return
    try {
      if (standalone) await deployWorkflow(workflow, selectedSerial, deploymentDependencies, false)
      else await agentApi.saveWorkflow(workflow)
      setIsNodeTest(true)
      setRun(await agentApi.startNodeTest(workflow.id, node.id, selectedSerial))
      setNotice(`Đang chạy thử duy nhất node “${node.id}” trên ${selectedSerial}`)
    }
    catch (reason) { setIsNodeTest(false); setNotice(reason instanceof Error ? `Không thể chạy thử node: ${reason.message}` : 'Không thể kết nối Agent') }
  }

  const toggleTargetDevice = (serial: string) => {
    const removing = targetSerials.includes(serial)
    const nextTargets = removing ? targetSerials.filter((item) => item !== serial) : [...targetSerials, serial]
    const primarySerial = removing ? nextTargets[0] ?? '' : serial
    setTargetSerials(nextTargets)
    setAgentDeviceSerial(primarySerial)
    setSelectedSerial(primarySerial)
    setDevice(undefined)
    setRun({ id: 'idle', state: 'IDLE', iteration: 0 })
    setConnectionRevision((value) => value + 1)
  }
  const connectWithToken = () => { setAgentToken(pairingInput, selectedSerial); setPairingInput(''); setShowPairing(false); setConnectionRevision((value) => value + 1) }
  const stopRun = async () => {
    const running = Object.entries(fleetProgress).filter(([, value]) => value.state === 'RUNNING').map(([serial]) => serial)
    const serials = running.length ? running : [selectedSerial].filter(Boolean)
    try {
      const stopped = await Promise.all(serials.map((serial) => agentApi.stopRun(serial)))
      setFleetProgress((current) => ({ ...current, ...Object.fromEntries(serials.map((serial, index) => [serial, { state: stopped[index].state, message: stopped[index].message, run: stopped[index] }])) }))
      if (selectedSerial) setRun(stopped[serials.indexOf(selectedSerial)] ?? stopped[0])
    } catch { setNotice('Không thể gửi lệnh dừng') }
  }

  const statusLabel = run.state === 'RUNNING' ? (isNodeTest ? 'ĐANG TEST NODE' : `ĐANG CHẠY · VÒNG ${run.iteration}`) : run.state
  const selectedAdbDevice = adbDevices.find((candidate) => candidate.serial === selectedSerial)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">AI</div><div><span>ROOTED ANDROID AUTOMATION</span><h1>Phone Studio</h1></div></div>
        <nav className="workspace-nav" aria-label="Khu vực làm việc"><button className={workspace === 'STUDIO' ? 'active' : ''} onClick={() => setWorkspace('STUDIO')}><ListTree size={16} /> Studio</button><button className={workspace === 'WORKFLOWS' ? 'active' : ''} onClick={() => setWorkspace('WORKFLOWS')}><Workflow size={16} /> Workflows</button><button className={workspace === 'ASSETS' ? 'active' : ''} onClick={() => setWorkspace('ASSETS')}><Boxes size={16} /> Assets</button></nav>
        <button className="device-strip" onClick={() => { if (standalone) { setShowDevices(true); void scanDevices() } else setShowPairing(true) }} title={standalone ? 'Chọn điện thoại USB' : 'Ghép nối Android Agent'}><div className={`connection-dot ${device ? 'online' : ''}`} /><div><span>{standalone && targetSerials.length > 1 ? `${targetSerials.length} FLEET TARGETS` : device ? 'AGENT ONLINE' : (selectedSerial ? 'USB ĐÃ CHỌN' : 'CHƯA CHỌN MÁY')}</span><strong>{device ? `${device.model} · Android ${device.androidVersion}` : (selectedAdbDevice?.model ? `${selectedAdbDevice.model} · ${selectedSerial}` : selectedSerial || 'Bấm để quét USB')}</strong></div>{selectedSerial ? <Usb size={18} /> : <CloudOff size={18} />}</button>
        <div className="top-actions">{standalone && <button className="toolbar-button" onClick={() => setShowLiveView(true)} disabled={!selectedSerial}><Monitor size={17} /> Live View</button>}<button className="toolbar-button" onClick={() => setCaptureTarget({ workflowId: workflow.id })} disabled={(standalone && !selectedSerial) || !isPaired}><Camera size={17} /> Capture Lab</button><button className="toolbar-button" onClick={() => void saveWorkflow()} disabled={isSaving}><Save size={17} /> Lưu</button>{run.state === 'RUNNING' ? <button className="run-button stop" onClick={() => void stopRun()}><CircleStop size={18} /> Dừng</button> : <button className="run-button" onClick={() => void startRun()} disabled={(standalone && !selectedSerial) || !isPaired}><Play size={18} fill="currentColor" /> Chạy</button>}</div>
      </header>

      <section className="status-rail"><div><Smartphone size={15} /><span>DISPLAY</span><strong>{device ? `${device.displayWidth} × ${device.displayHeight}` : '2608 × 1200'}</strong></div><div><Cpu size={15} /><span>ROOT / INSPECTOR</span><strong className={device?.rootGranted ? 'good' : 'warn'}>{device ? `${device.rootGranted ? 'KERNELSU' : 'NO ROOT'} · ${device.accessibilityReady ? 'TEXT READY' : 'TEXT AUTO'}` : 'CHƯA KIỂM TRA'}</strong></div><div><span>WORKFLOW</span><strong>{workflow.name} · r{workflow.revision}</strong></div><div><span>VALIDATION</span><strong className={validation.valid ? 'good' : 'bad'}>{validation.valid ? 'SẴN SÀNG' : `${validation.issues.length} LỖI`}</strong></div><div className="run-state"><span>RUN</span><strong data-state={run.state}>{statusLabel}</strong></div></section>
      {standalone && <FleetDeployBar devices={adbDevices} targetSerials={targetSerials} progress={fleetProgress} busy={isFleetBusy} onChooseDevices={() => { setShowDevices(true); void scanDevices() }} onDeploy={() => void deployToFleet(false)} onDeployAndRun={() => void deployToFleet(true)} />}
      {notice && <button className="notice-bar" onClick={() => setNotice(undefined)}>{notice}<span>Đóng</span></button>}
      <RunLogPanel run={run} expanded={isLogExpanded} onToggle={() => setLogExpanded((value) => !value)} />

      {workspace === 'STUDIO' && <WorkflowCanvas workflow={workflow} activeNodeId={run.currentNodeId} onChange={changeWorkflow} onPlayNode={(node) => void playNode(node)} isNodeTestRunning={!isPaired || (isNodeTest && run.state === 'RUNNING')} />}
      {workspace === 'WORKFLOWS' && <WorkflowManager workflows={workflows} selectedId={workflow.id} onSelect={(id) => { setSelectedWorkflowId(id); setWorkspace('STUDIO') }} onCreate={(name) => void createWorkflow(name)} onRename={(id, name) => void renameWorkflow(id, name)} onDelete={(id) => void deleteWorkflow(id)} />}
      {workspace === 'ASSETS' && <AssetLibrary workflows={workflows} selectedWorkflowId={workflow.id} onSelectWorkflow={setSelectedWorkflowId} onCapture={(workflowId) => setCaptureTarget({ workflowId })} onReplace={(asset) => setCaptureTarget({ workflowId: asset.workflowId, initialImageAsset: asset })} onRename={(asset, name) => void renameAsset(asset, name)} onDelete={(asset) => void deleteAsset(asset)} getAssetImage={standalone ? projectApi.getAssetImage : agentApi.getAssetImage} />}

      <footer className="footer-strip"><span>AIPhone Studio v0.2</span><span>{workflow.nodes.length} nodes · {workflow.edges.length} edges · {workflow.assets.length} Assets</span><span>{selectedSerial ? `USB: ${selectedSerial}` : 'Target: chưa chọn điện thoại'}</span></footer>

      {captureTarget && <CaptureLab workflowId={captureTarget.workflowId} initialImageAsset={captureTarget.initialImageAsset} capture={agentApi.captureScreenshot} inspect={agentApi.getUiHierarchy} onClose={() => setCaptureTarget(undefined)} onSaveImage={saveImageAsset} onSaveSelector={saveSelectorAsset} />}
      {showLiveView && selectedSerial && <LiveViewPanel serial={selectedSerial} onClose={() => setShowLiveView(false)} />}
      {showDevices && standalone && <div className="modal-backdrop device-backdrop"><section className="device-card" role="dialog" aria-modal="true" aria-labelledby="device-title"><header><div><span>USB FLEET / ADB</span><h2 id="device-title">Chọn các điện thoại đích</h2></div><button className="icon-button" onClick={() => setShowDevices(false)} aria-label="Đóng"><X size={18} /></button></header><p>Chọn nhiều máy để đồng bộ/chạy hàng loạt. Máy bấm gần nhất là máy chính dùng Capture Lab và test từng node.</p><div className="device-list">{adbDevices.length === 0 && <div className="device-empty"><Usb size={24} /><strong>Chưa tìm thấy thiết bị</strong><span>Kiểm tra cáp USB rồi bấm Quét lại.</span></div>}{adbDevices.map((candidate) => <button key={candidate.serial} className={`device-option ${targetSerials.includes(candidate.serial) ? 'selected' : ''}`} disabled={candidate.state !== 'device'} onClick={() => toggleTargetDevice(candidate.serial)}><span className="device-check">{targetSerials.includes(candidate.serial) ? '✓' : ''}</span><span><strong>{candidate.model || candidate.serial}</strong><small>{candidate.serial} · {hasAgentToken(candidate.serial) ? 'đã ghép nối' : 'cần pairing token'}</small></span><em data-state={candidate.state}>{candidate.serial === selectedSerial ? 'Máy chính' : candidate.state === 'device' ? 'Sẵn sàng' : candidate.state}</em></button>)}</div><footer><button className="secondary-button" onClick={() => void scanDevices()} disabled={isScanning}><RefreshCw size={16} className={isScanning ? 'spin' : ''} /> {isScanning ? 'Đang quét...' : 'Quét lại'}</button><button className="primary-button" onClick={() => { setShowDevices(false); if (selectedSerial && !hasAgentToken(selectedSerial)) setShowPairing(true) }}>Dùng {targetSerials.length} máy</button></footer></section></div>}
      {showPairing && <div className="modal-backdrop pairing-backdrop"><section className="pairing-card" role="dialog" aria-modal="true" aria-labelledby="pairing-title"><span>SECURE ROOT CHANNEL</span><h2 id="pairing-title">Ghép nối với Android Agent</h2><p>Nhập pairing token hiển thị trong app AIPhone Agent. Token chỉ tồn tại trong phiên trình duyệt này.</p><input id="pairing-token" name="pairing-token" aria-label="Pairing token" autoFocus value={pairingInput} onChange={(event) => setPairingInput(event.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx" /><div><button className="secondary-button" onClick={() => setShowPairing(false)}>Dùng bản nháp offline</button><button className="primary-button" disabled={pairingInput.replace(/\s/g, '').length < 16} onClick={connectWithToken}>Kết nối Agent</button></div></section></div>}
    </main>
  )
}
