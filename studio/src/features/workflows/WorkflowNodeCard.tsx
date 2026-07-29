import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { NodeType } from '../../contracts/workflow'
import { nodeDefinition } from './nodeCatalog'

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: NodeType
  config: Record<string, unknown>
  isActive?: boolean
}

export function WorkflowNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const definition = nodeDefinition(nodeData.nodeType)
  const Icon = definition.icon
  const isBranch = nodeData.nodeType === 'IF_IMAGE' || nodeData.nodeType === 'WAIT_IMAGE'
  const isTerminal = nodeData.nodeType === 'SUCCESS' || nodeData.nodeType === 'FAILURE'

  return (
    <div className={`flow-node ${selected ? 'is-selected' : ''} ${nodeData.isActive ? 'is-active' : ''}`} style={{ '--node-accent': definition.accent } as CSSProperties}>
      {nodeData.nodeType !== 'START' && <Handle type="target" position={Position.Left} />}
      <div className="flow-node__icon"><Icon size={18} /></div>
      <div className="flow-node__copy">
        <strong>{definition.label}</strong>
        <span>{definition.description}</span>
      </div>
      {isBranch && <GitBranch className="flow-node__branch" size={15} />}
      {!isTerminal && !isBranch && <Handle type="source" position={Position.Right} />}
      {isBranch && (
        <>
          <Handle id="FOUND" type="source" position={Position.Right} style={{ top: '38%' }} />
          <Handle id="TIMEOUT" type="source" position={Position.Right} style={{ top: '70%' }} />
        </>
      )}
    </div>
  )
}
