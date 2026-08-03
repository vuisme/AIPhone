import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Eye, EyeOff, GitBranch, Play, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { NodeType } from '../../contracts/workflow'
import { nodeDefinition, rootBadgeLabel } from './nodeCatalog'

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: NodeType
  config: Record<string, unknown>
  isActive?: boolean
  disabled?: boolean
  onPlay?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
  onToggleDisabled?: (nodeId: string) => void
  isNodeTestRunning?: boolean
}

export function WorkflowNodeCard({ id, data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const definition = nodeDefinition(nodeData.nodeType)
  const Icon = definition.icon
  const outcomes = definition.outcomes ?? []
  const isBranch = outcomes.length > 0
  const isTerminal = nodeData.nodeType === 'SUCCESS' || nodeData.nodeType === 'FAILURE'
  const rootBadge = rootBadgeLabel(nodeData.nodeType, nodeData.config)

  return (
    <div className={`flow-node ${selected ? 'is-selected' : ''} ${nodeData.isActive ? 'is-active' : ''} ${nodeData.disabled ? 'is-disabled' : ''} ${rootBadge ? 'has-root' : ''}`} style={{ '--node-accent': definition.accent } as CSSProperties}>
      {nodeData.nodeType !== 'START' && <Handle type="target" position={Position.Left} />}
      <div className="flow-node__actions nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
        <button title="Play node" aria-label="Play node" disabled={nodeData.isNodeTestRunning} onClick={(event) => { event.stopPropagation(); nodeData.onPlay?.(id) }}><Play size={12} fill="currentColor" /></button>
        {nodeData.nodeType !== 'START' && (
          <button title={nodeData.disabled ? 'Bật node' : 'Disable node'} aria-label={nodeData.disabled ? 'Bật node' : 'Disable node'} onClick={(event) => { event.stopPropagation(); nodeData.onToggleDisabled?.(id) }}>
            {nodeData.disabled ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        )}
        {nodeData.nodeType !== 'START' && <button className="node-action--danger" title="Xóa node" aria-label="Xóa node" onClick={(event) => { event.stopPropagation(); nodeData.onDelete?.(id) }}><Trash2 size={12} /></button>}
      </div>
      <div className="flow-node__icon"><Icon size={18} /></div>
      <div className="flow-node__copy">
        <strong>{definition.label}</strong>
        <span>{definition.description}</span>
      </div>
      {rootBadge && <span className="flow-node__root-badge" title="Yêu cầu quyền root">{rootBadge}</span>}
      {isBranch && <GitBranch className="flow-node__branch" size={15} />}
      {!isTerminal && !isBranch && <Handle type="source" position={Position.Right} />}
      {isBranch && (
        outcomes.map((outcome, index) => {
          const top = `${Math.round(((index + 1) / (outcomes.length + 1)) * 100)}%`
          return <div className="flow-node__outcome" key={outcome.id} style={{ top }}><span>{outcome.label}</span><Handle id={outcome.id} type="source" position={Position.Right} title={outcome.label} /></div>
        })
      )}
    </div>
  )
}
