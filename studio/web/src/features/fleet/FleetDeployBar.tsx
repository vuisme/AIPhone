import { CloudUpload, Play, Smartphone, TriangleAlert } from 'lucide-react'
import type { AdbDevice, RunStatus } from '../../api/client'

export interface FleetDeviceProgress {
  state: 'IDLE' | 'SYNCING' | 'READY' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'STOPPED'
  message?: string
  run?: RunStatus
}

interface FleetDeployBarProps {
  devices: AdbDevice[]
  targetSerials: string[]
  progress: Record<string, FleetDeviceProgress>
  busy: boolean
  onChooseDevices: () => void
  onDeploy: () => void
  onDeployAndRun: () => void
}

export function FleetDeployBar({ devices, targetSerials, progress, busy, onChooseDevices, onDeploy, onDeployAndRun }: FleetDeployBarProps) {
  const targets = targetSerials.map((serial) => devices.find((device) => device.serial === serial) ?? { serial, model: null })
  return (
    <section className="fleet-bar" aria-label="Triển khai nhiều điện thoại">
      <button className="fleet-target-button" onClick={onChooseDevices}><Smartphone size={17} /><span><small>FLEET TARGETS</small><strong>{targets.length ? `${targets.length} điện thoại` : 'Chọn điện thoại'}</strong></span></button>
      <div className="fleet-target-list">
        {targets.length === 0 && <span className="fleet-empty"><TriangleAlert size={14} /> Chưa có máy đích</span>}
        {targets.map((device) => {
          const status = progress[device.serial]?.state ?? 'IDLE'
          return <span className="fleet-target" data-state={status} key={device.serial} title={progress[device.serial]?.message}><i />{device.model || device.serial}<b>{status}</b></span>
        })}
      </div>
      <div className="fleet-actions">
        <button className="secondary-button" disabled={busy || targets.length === 0} onClick={onDeploy}><CloudUpload size={16} /> Đồng bộ</button>
        <button className="primary-button" disabled={busy || targets.length === 0} onClick={onDeployAndRun}><Play size={16} fill="currentColor" /> Đồng bộ & chạy</button>
      </div>
    </section>
  )
}
