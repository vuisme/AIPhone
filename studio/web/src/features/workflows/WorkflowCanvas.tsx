import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { Link2Off } from 'lucide-react'
import type { NodeType, WorkflowDocument, WorkflowNode } from '../../contracts/workflow'
import type { TtsCapabilities } from '../../api/client'
import { NODE_CATALOG, nodeDefinition, type NodeCategory } from './nodeCatalog'
import { NodeInspectorFields } from './NodeInspectorFields'
import { WorkflowNodeCard, type WorkflowNodeData } from './WorkflowNodeCard'
import { removeEdgeById, toggleNodeDisabled } from './workflowGraph'
import { ttsRuntimeVariableReferences } from './runtimeVariableReferences'

interface WorkflowCanvasProps {
  workflow: WorkflowDocument
  activeNodeId?: string
  onChange: (workflow: WorkflowDocument) => void
  onPlayNode: (node: WorkflowNode) => void
  onPickCoordinates: (node: WorkflowNode) => void
  isNodeTestRunning?: boolean
  ttsCapabilities?: TtsCapabilities
  ttsCapabilitiesLoading?: boolean
  ttsCapabilitiesError?: string
  onRefreshTtsCapabilities?: () => void
}

const nodeTypes = { workflow: WorkflowNodeCard }
const VARIABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/

function toFlowNode(node: WorkflowNode, activeNodeId?: string): Node<WorkflowNodeData> {
  return {
    id: node.id,
    type: 'workflow',
    position: node.position,
    data: { nodeType: node.type, displayName: node.displayName, config: node.config, disabled: node.disabled, isActive: node.id === activeNodeId },
  }
}

function toWorkflowNode(node: Node<WorkflowNodeData>): WorkflowNode {
  return {
    id: node.id,
    type: node.data.nodeType,
    displayName: node.data.displayName?.trim() || undefined,
    position: node.position,
    config: node.data.config,
    disabled: node.data.disabled,
  }
}

export function WorkflowCanvas({ workflow, activeNodeId, onChange, onPlayNode, onPickCoordinates, isNodeTestRunning = false, ttsCapabilities, ttsCapabilitiesLoading, ttsCapabilitiesError, onRefreshTtsCapabilities }: WorkflowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const lastPublishedWorkflow = useRef<WorkflowDocument | undefined>(undefined)
  const [instance, setInstance] = useState<ReactFlowInstance<Node<WorkflowNodeData>, Edge>>()
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>(() => workflow.nodes.map((node) => toFlowNode(node, activeNodeId)))
  const [edges, setEdges] = useState<Edge[]>(() => workflow.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>()

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId)
  const selectedDefinition = selectedNode ? nodeDefinition(selectedNode.data.nodeType) : undefined
  const loopIds = useMemo(() => Array.from(new Set(nodes
    .filter((node) => node.data.nodeType === 'LOOP')
    .map((node) => String(node.data.config.loopId ?? '').trim())
    .filter((loopId) => loopId && !loopId.includes('{{')))),
  [nodes])

  useEffect(() => {
    if (workflow === lastPublishedWorkflow.current) return
    setNodes(workflow.nodes.map((node) => toFlowNode(node, activeNodeId)))
    setEdges(workflow.edges)
    setSelectedNodeId((current) => workflow.nodes.some((node) => node.id === current) ? current : undefined)
    setSelectedEdgeId((current) => workflow.edges.some((edge) => edge.id === current) ? current : undefined)
  }, [activeNodeId, workflow])

  const publish = (nextNodes: Node<WorkflowNodeData>[], nextEdges: Edge[]) => {
    setNodes(nextNodes)
    setEdges(nextEdges)
    const nextWorkflow: WorkflowDocument = {
      ...workflow,
      revision: workflow.revision + 1,
      nodes: nextNodes.map(toWorkflowNode),
      edges: nextEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? undefined })),
      updatedAt: new Date().toISOString(),
    }
    lastPublishedWorkflow.current = nextWorkflow
    onChange(nextWorkflow)
  }

  const onNodesChange = (changes: NodeChange<Node<WorkflowNodeData>>[]) => {
    for (const change of changes) {
      if (change.type === 'select' && change.selected) {
        setSelectedNodeId(change.id)
        setSelectedEdgeId(undefined)
      }
    }
    const nextNodes = applyNodeChanges(changes, nodes)
    if (changes.every((change) => change.type === 'select' || change.type === 'dimensions')) setNodes(nextNodes)
    else publish(nextNodes, edges)
  }

  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    for (const change of changes) {
      if (change.type === 'select' && change.selected) {
        setSelectedEdgeId(change.id)
        setSelectedNodeId(undefined)
      }
    }
    const nextEdges = applyEdgeChanges(changes, edges)
    if (changes.every((change) => change.type === 'select')) setEdges(nextEdges)
    else publish(nodes, nextEdges)
  }

  const onConnect = (connection: Connection) => {
    publish(nodes, addEdge({ ...connection, id: crypto.randomUUID(), animated: true }, edges))
  }

  const addNode = (type: NodeType, position = { x: 260, y: 180 }) => {
    const definition = nodeDefinition(type)
    if (type === 'START' && nodes.some((node) => node.data.nodeType === 'START')) return
    const suffix = crypto.randomUUID().slice(0, 8)
    const config = {
      ...definition.defaultConfig,
      ...(type === 'LOOP' ? { loopId: `loop-${suffix}` } : {}),
      ...(type === 'LOOP_BREAKPOINT' ? { loopId: loopIds[0] ?? '' } : {}),
    }
    const node: Node<WorkflowNodeData> = {
      id: `${type.toLowerCase()}-${suffix}`,
      type: 'workflow',
      position,
      data: { nodeType: type, config },
    }
    publish([...nodes, node], edges)
    setSelectedNodeId(node.id)
    setSelectedEdgeId(undefined)
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/aiphone-node') as NodeType
    if (!type || !instance) return
    addNode(type, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateConfig = (key: string, value: unknown) => {
    const nextNodes = nodes.map((node) =>
      node.id === selectedNodeId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node,
    )
    publish(nextNodes, edges)
  }

  const updateDisplayName = (displayName: string) => {
    publish(nodes.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, displayName } } : node), edges)
  }

  const deleteNode = (nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId)
    if (!target || target.data.nodeType === 'START') return
    publish(
      nodes.filter((node) => node.id !== nodeId),
      edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    )
    if (selectedNodeId === nodeId) setSelectedNodeId(undefined)
  }

  const playNode = (nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId)
    if (target) onPlayNode(toWorkflowNode(target))
  }

  const toggleDisabled = (nodeId: string) => {
    const toggled = toggleNodeDisabled(nodes.map(toWorkflowNode), nodeId)
    const disabledById = new Map(toggled.map((node) => [node.id, node.disabled]))
    publish(nodes.map((node) => ({ ...node, data: { ...node.data, disabled: disabledById.get(node.id) } })), edges)
  }

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return
    publish(nodes, removeEdgeById(edges, selectedEdgeId))
    setSelectedEdgeId(undefined)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!selectedEdgeId || !['Backspace', 'Delete'].includes(event.key) || target?.matches('input, textarea, select')) return
      event.preventDefault()
      deleteSelectedEdge()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const categories = useMemo<NodeCategory[]>(() => ['Luồng', 'Dữ liệu', 'Hình ảnh', 'Tương tác', 'Âm thanh', 'Ứng dụng'], [])
  const variables = useMemo(() => Array.from(new Set([
    ...workflow.parameters.map((parameter) => parameter.name),
    ...nodes.filter((node) => node.data.nodeType === 'SET_VARIABLE').map((node) => String(node.data.config.name ?? '')).filter((name) => VARIABLE_NAME.test(name)),
    ...nodes.filter((node) => node.data.nodeType === 'TTS_SPEAK' && VARIABLE_NAME.test(String(node.data.config.outputVariable ?? ''))).flatMap((node) => ttsRuntimeVariableReferences(String(node.data.config.outputVariable)).map((reference) => reference.name)),
  ])).sort(), [nodes, workflow.parameters])

  return (
    <div className="builder-shell">
      <aside className="node-library">
        <div className="panel-heading">
          <span>NODE LIBRARY</span>
          <strong>{NODE_CATALOG.length}</strong>
        </div>
        {categories.map((category) => (
          <section key={category}>
            <h3>{category}</h3>
            <div className="node-library__items">
              {NODE_CATALOG.filter((item) => item.category === category).map((item) => {
                const Icon = item.icon
                return (
                  <button
                    className="library-node"
                    key={item.type}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/aiphone-node', item.type)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDoubleClick={() => addNode(item.type)}
                    title="Kéo vào canvas hoặc nhấp đúp để thêm"
                  >
                    <span style={{ background: item.accent }}><Icon size={16} /></span>
                    <div><strong>{item.label}</strong><small>{item.description}</small></div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </aside>

      <div className="flow-stage" ref={wrapperRef} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
        <ReactFlow
          nodes={nodes.map((node) => ({
            ...node,
            data: {
              ...node.data,
              isActive: node.id === activeNodeId,
              isNodeTestRunning,
              onPlay: playNode,
              onDelete: deleteNode,
              onToggleDisabled: toggleDisabled,
            },
          }))}
          edges={edges.map((edge) => ({ ...edge, selected: edge.id === selectedEdgeId }))}
          nodeTypes={nodeTypes}
          onInit={setInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id)
            setSelectedEdgeId(undefined)
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id)
            setSelectedNodeId(undefined)
          }}
          onEdgeDoubleClick={(_, edge) => {
            publish(nodes, removeEdgeById(edges, edge.id))
            setSelectedEdgeId(undefined)
          }}
          onPaneClick={() => {
            setSelectedNodeId(undefined)
            setSelectedEdgeId(undefined)
          }}
          fitView
          minZoom={0.3}
          maxZoom={1.7}
          deleteKeyCode={null}
        >
          <Background color="#3d4a48" gap={24} size={1} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(node) => nodeDefinition((node.data as WorkflowNodeData).nodeType).accent} />
        </ReactFlow>
        <div className="canvas-hint">KÉO NODE VÀO ĐÂY · NỐI CÁC CỔNG ĐỂ TẠO LUỒNG</div>
      </div>

      <aside className="inspector">
        <div className="panel-heading"><span>INSPECTOR</span></div>
        {selectedEdge ? (
          <div className="inspector-form">
            <div className="inspector-title edge-title">
              <strong>Liên kết</strong>
              <code>{selectedEdge.id}</code>
            </div>
            <div className="edge-route"><span>{selectedEdge.source}</span><strong>→</strong><span>{selectedEdge.target}</span></div>
            <button className="danger-button" onClick={deleteSelectedEdge}><Link2Off size={16} /> Xóa liên kết</button>
            <small className="keyboard-hint">Có thể dùng phím Delete hoặc Backspace.</small>
          </div>
        ) : !selectedNode || !selectedDefinition ? (
          <div className="inspector-empty"><span>01</span><p>Chọn một node để chỉnh cấu hình.</p></div>
        ) : (
          <div className="inspector-form">
            <div className="inspector-title" style={{ borderColor: selectedDefinition.accent }}>
              <strong>{selectedNode.data.displayName?.trim() || selectedDefinition.label}</strong>
              <code>{selectedNode.id}</code>
            </div>
            <label>Tên hiển thị<input aria-label="Tên hiển thị node" value={selectedNode.data.displayName ?? ''} maxLength={80} placeholder={selectedDefinition.label} onChange={(event) => updateDisplayName(event.target.value)} /></label>
            <NodeInspectorFields definition={selectedDefinition} nodeType={selectedNode.data.nodeType} config={selectedNode.data.config} assets={workflow.assets} variables={variables} loopIds={loopIds} ttsCapabilities={ttsCapabilities} ttsCapabilitiesLoading={ttsCapabilitiesLoading} ttsCapabilitiesError={ttsCapabilitiesError} onRefreshTtsCapabilities={onRefreshTtsCapabilities} onPickCoordinates={() => onPickCoordinates(toWorkflowNode(selectedNode))} onChange={updateConfig} />
          </div>
        )}
      </aside>
    </div>
  )
}
