import { useMemo, useRef, useState } from 'react'
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
import { Trash2 } from 'lucide-react'
import type { NodeType, WorkflowDocument, WorkflowNode } from '../../contracts/workflow'
import { NODE_CATALOG, nodeDefinition } from './nodeCatalog'
import { WorkflowNodeCard, type WorkflowNodeData } from './WorkflowNodeCard'

interface WorkflowCanvasProps {
  workflow: WorkflowDocument
  activeNodeId?: string
  onChange: (workflow: WorkflowDocument) => void
}

const nodeTypes = { workflow: WorkflowNodeCard }

function toFlowNode(node: WorkflowNode, activeNodeId?: string): Node<WorkflowNodeData> {
  return {
    id: node.id,
    type: 'workflow',
    position: node.position,
    data: { nodeType: node.type, config: node.config, isActive: node.id === activeNodeId },
  }
}

function toWorkflowNode(node: Node<WorkflowNodeData>): WorkflowNode {
  return {
    id: node.id,
    type: node.data.nodeType,
    position: node.position,
    config: node.data.config,
  }
}

export function WorkflowCanvas({ workflow, activeNodeId, onChange }: WorkflowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [instance, setInstance] = useState<ReactFlowInstance<Node<WorkflowNodeData>, Edge>>()
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>(() => workflow.nodes.map((node) => toFlowNode(node, activeNodeId)))
  const [edges, setEdges] = useState<Edge[]>(() => workflow.edges)
  const [selectedId, setSelectedId] = useState<string>()

  const selectedNode = nodes.find((node) => node.id === selectedId)
  const selectedDefinition = selectedNode ? nodeDefinition(selectedNode.data.nodeType) : undefined

  const publish = (nextNodes: Node<WorkflowNodeData>[], nextEdges: Edge[]) => {
    setNodes(nextNodes)
    setEdges(nextEdges)
    onChange({
      ...workflow,
      revision: workflow.revision + 1,
      nodes: nextNodes.map(toWorkflowNode),
      edges: nextEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? undefined })),
      updatedAt: new Date().toISOString(),
    })
  }

  const onNodesChange = (changes: NodeChange<Node<WorkflowNodeData>>[]) => {
    publish(applyNodeChanges(changes, nodes), edges)
  }

  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    publish(nodes, applyEdgeChanges(changes, edges))
  }

  const onConnect = (connection: Connection) => {
    publish(nodes, addEdge({ ...connection, id: crypto.randomUUID(), animated: true }, edges))
  }

  const addNode = (type: NodeType, position = { x: 260, y: 180 }) => {
    const definition = nodeDefinition(type)
    if (type === 'START' && nodes.some((node) => node.data.nodeType === 'START')) return
    const node: Node<WorkflowNodeData> = {
      id: `${type.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
      type: 'workflow',
      position,
      data: { nodeType: type, config: { ...definition.defaultConfig } },
    }
    publish([...nodes, node], edges)
    setSelectedId(node.id)
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/aiphone-node') as NodeType
    if (!type || !instance) return
    addNode(type, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateConfig = (key: string, value: unknown) => {
    const nextNodes = nodes.map((node) =>
      node.id === selectedId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node,
    )
    publish(nextNodes, edges)
  }

  const deleteSelected = () => {
    if (!selectedNode || selectedNode.data.nodeType === 'START') return
    publish(
      nodes.filter((node) => node.id !== selectedNode.id),
      edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
    )
    setSelectedId(undefined)
  }

  const categories = useMemo(() => ['Luồng', 'Hình ảnh', 'Ứng dụng'] as const, [])

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
          nodes={nodes.map((node) => ({ ...node, data: { ...node.data, isActive: node.id === activeNodeId } }))}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(undefined)}
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
        {!selectedNode || !selectedDefinition ? (
          <div className="inspector-empty"><span>01</span><p>Chọn một node để chỉnh cấu hình.</p></div>
        ) : (
          <div className="inspector-form">
            <div className="inspector-title" style={{ borderColor: selectedDefinition.accent }}>
              <strong>{selectedDefinition.label}</strong>
              <code>{selectedNode.id}</code>
            </div>
            {['WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE'].includes(selectedNode.data.nodeType) && (
              <label>Template
                <select value={String(selectedNode.data.config.templateId ?? '')} onChange={(event) => updateConfig('templateId', event.target.value)}>
                  <option value="">Chọn template...</option>
                  {workflow.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
            )}
            {'threshold' in selectedNode.data.config && (
              <label>Độ tin cậy
                <div className="range-row"><input type="range" min="0.5" max="1" step="0.01" value={Number(selectedNode.data.config.threshold)} onChange={(event) => updateConfig('threshold', Number(event.target.value))} /><output>{Math.round(Number(selectedNode.data.config.threshold) * 100)}%</output></div>
              </label>
            )}
            {'timeoutMs' in selectedNode.data.config && (
              <label>Timeout (ms)<input type="number" min="100" value={Number(selectedNode.data.config.timeoutMs)} onChange={(event) => updateConfig('timeoutMs', Number(event.target.value))} /></label>
            )}
            {'durationMs' in selectedNode.data.config && (
              <label>Thời gian chờ (ms)<input type="number" min="0" value={Number(selectedNode.data.config.durationMs)} onChange={(event) => updateConfig('durationMs', Number(event.target.value))} /></label>
            )}
            {'maxIterations' in selectedNode.data.config && (
              <label>Số vòng tối đa<input type="number" min="0" value={Number(selectedNode.data.config.maxIterations)} onChange={(event) => updateConfig('maxIterations', Number(event.target.value))} /><small>0 = không giới hạn</small></label>
            )}
            {'packageName' in selectedNode.data.config && (
              <label>Package<input value={String(selectedNode.data.config.packageName)} onChange={(event) => updateConfig('packageName', event.target.value)} /></label>
            )}
            {'userId' in selectedNode.data.config && (
              <label>Android user<input type="number" value={Number(selectedNode.data.config.userId)} onChange={(event) => updateConfig('userId', Number(event.target.value))} /></label>
            )}
            {'message' in selectedNode.data.config && (
              <label>Thông báo<input value={String(selectedNode.data.config.message)} onChange={(event) => updateConfig('message', event.target.value)} /></label>
            )}
            <button className="danger-button" onClick={deleteSelected} disabled={selectedNode.data.nodeType === 'START'}><Trash2 size={16} /> Xóa node</button>
          </div>
        )}
      </aside>
    </div>
  )
}

