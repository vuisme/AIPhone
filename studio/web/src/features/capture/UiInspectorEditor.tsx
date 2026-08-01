import { Check, Code2, MousePointer2, ScanText } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { UiHierarchyNode, UiHierarchySnapshot } from '../../api/client'
import type { Size } from './crop'
import type { UiSelectorAssetRecord } from '../../contracts/workflow'
import { slugifyId } from '../../lib/ids'

interface UiInspectorEditorProps {
  workflowId: string
  imageUrl: string
  nativeSize: Size
  hierarchy: UiHierarchySnapshot
  onSave: (asset: UiSelectorAssetRecord, createNode: boolean) => Promise<void>
}

function selectorId(name: string): string {
  return `${slugifyId(name, 'selector')}-${Date.now().toString(36)}`
}

function nodeLabel(node: UiHierarchyNode): string {
  return node.text || node.contentDescription || node.resourceId || node.className
}

export function inspectorCandidates(nodes: UiHierarchyNode[]): UiHierarchyNode[] {
  return nodes.filter((node) => node.visible && node.enabled && node.bounds.right > node.bounds.left && node.bounds.bottom > node.bounds.top && Boolean(node.text || node.contentDescription || node.resourceId))
}

export function UiInspectorEditor({ workflowId, imageUrl, nativeSize, hierarchy, onSave }: UiInspectorEditorProps) {
  const candidates = useMemo(() => inspectorCandidates(hierarchy.nodes), [hierarchy.nodes])
  const [selectedId, setSelectedId] = useState<number>()
  const selected = candidates.find((node) => node.id === selectedId)
  const [name, setName] = useState('Text mục tiêu')
  const [matchMode, setMatchMode] = useState<'EXACT' | 'CONTAINS'>('EXACT')
  const [createNode, setCreateNode] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>()

  const save = async () => {
    if (!selected) return
    setIsSaving(true)
    setError(undefined)
    try {
      await onSave({
        id: selectorId(name),
        workflowId,
        type: 'UI_SELECTOR',
        name: name.trim() || nodeLabel(selected),
        selector: {
          text: selected.text || undefined,
          contentDescription: selected.contentDescription || undefined,
          resourceId: selected.resourceId || undefined,
          className: selected.className || undefined,
          packageName: selected.packageName || undefined,
          bounds: selected.bounds,
          matchMode,
        },
        updatedAt: new Date().toISOString(),
      }, createNode)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu selector')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="inspector-mode-grid">
      <div className="ui-inspector-stage">
        <div className="capture-image-wrap ui-overlay-wrap">
          <img src={imageUrl} alt="Màn hình điện thoại với UI bounds" />
          {candidates.map((node) => <button key={node.id} className={`ui-node-box ${node.id === selectedId ? 'selected' : ''}`} style={{ left: `${node.bounds.left / nativeSize.width * 100}%`, top: `${node.bounds.top / nativeSize.height * 100}%`, width: `${(node.bounds.right - node.bounds.left) / nativeSize.width * 100}%`, height: `${(node.bounds.bottom - node.bounds.top) / nativeSize.height * 100}%` }} title={nodeLabel(node)} aria-label={`Chọn UI node ${nodeLabel(node)}`} onClick={() => { setSelectedId(node.id); setName(nodeLabel(node)) }} />)}
        </div>
        {hierarchy.surfaceOnly && <div className="inspector-warning"><ScanText size={18} /><span>Cây UI chỉ có SurfaceView. Text bên trong Unity không đọc được; hãy dùng Asset ảnh.</span></div>}
      </div>
      <aside className="ui-node-list">
        <div className="capture-stat"><span>PACKAGE</span><strong>{hierarchy.packageName || 'unknown'}</strong></div>
        <div className="ui-node-scroll">{candidates.length === 0 ? <div className="asset-empty"><ScanText size={24} /><strong>Không có text khả dụng</strong></div> : candidates.map((node) => <button key={node.id} className={node.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(node.id); setName(nodeLabel(node)) }}><MousePointer2 size={14} /><span><strong>{nodeLabel(node)}</strong><small>{node.className} · [{node.bounds.left},{node.bounds.top}]</small></span></button>)}</div>
        {selected && <div className="selector-form"><label>Tên Asset selector<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Kiểu match<select value={matchMode} onChange={(event) => setMatchMode(event.target.value as 'EXACT' | 'CONTAINS')}><option value="EXACT">Chính xác</option><option value="CONTAINS">Có chứa</option></select></label><label className="checkbox-label"><input type="checkbox" checked={createNode} onChange={(event) => setCreateNode(event.target.checked)} /> Tạo luôn node Bấm theo text</label></div>}
        <details className="xml-dump"><summary><Code2 size={14} /> XML dump</summary><pre>{hierarchy.xml}</pre></details>
        {error && <div className="inline-error">{error}</div>}
        <button className="primary-button" disabled={!selected || isSaving} onClick={() => void save()}><Check size={16} /> Lưu selector</button>
      </aside>
    </div>
  )
}
