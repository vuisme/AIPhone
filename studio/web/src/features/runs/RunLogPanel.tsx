import { ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import type { RunLogEntry, RunStatus } from '../../api/client'

interface RunLogPanelProps {
  run: RunStatus
  expanded: boolean
  onToggle: () => void
}

function displayEntries(run: RunStatus): RunLogEntry[] {
  if (run.logs?.length) return run.logs
  if (!run.message) return []
  return [{
    timestamp: run.finishedAt ?? run.startedAt ?? new Date(0).toISOString(),
    level: run.state === 'FAILED' ? 'ERROR' : 'INFO',
    message: run.message,
    nodeId: run.currentNodeId,
  }]
}

function formatTime(timestamp: string): string {
  const value = new Date(timestamp)
  return Number.isNaN(value.getTime()) ? '--:--:--' : value.toLocaleTimeString('vi-VN', { hour12: false })
}

export function RunLogPanel({ run, expanded, onToggle }: RunLogPanelProps) {
  const entries = displayEntries(run)
  const latest = entries.at(-1)

  return (
    <aside className={`run-log-panel ${expanded ? 'expanded' : ''}`}>
      <button className="run-log-panel__header" onClick={onToggle} aria-label={expanded ? 'Thu gọn log' : 'Mở log'}>
        <Terminal size={15} />
        <strong>LOG</strong>
        <span className={`run-log-state state-${run.state.toLowerCase()}`}>{run.state}</span>
        <small>{latest?.message ?? 'Chưa có log'}</small>
        {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {expanded && (
        <div className="run-log-panel__body" role="log" aria-live="polite">
          {entries.length === 0 ? (
            <div className="run-log-empty">Log sẽ xuất hiện khi chạy workflow hoặc Play node.</div>
          ) : entries.map((entry, index) => (
            <div className={`run-log-entry level-${entry.level.toLowerCase()}`} key={`${entry.timestamp}-${index}`}>
              <time>{formatTime(entry.timestamp)}</time>
              <b>{entry.level}</b>
              <code>{entry.nodeId ?? 'run'}</code>
              <p>{entry.message}</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
