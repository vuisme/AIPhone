import { Check, FilePlus2, Pencil, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import type { WorkflowDocument } from '../../contracts/workflow'

interface WorkflowManagerProps {
  workflows: WorkflowDocument[]
  selectedId: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function WorkflowManager({ workflows, selectedId, onSelect, onCreate, onRename, onDelete }: WorkflowManagerProps) {
  const [newName, setNewName] = useState('Workflow mới')
  const [editingId, setEditingId] = useState<string>()
  const [editingName, setEditingName] = useState('')

  return (
    <section className="workspace-page workflow-manager" aria-labelledby="workflow-manager-title">
      <header className="workspace-page__header">
        <div><span>WORKFLOW REGISTRY</span><h2 id="workflow-manager-title">Quản lý kịch bản</h2><p>Mỗi workflow có graph và kho Asset riêng.</p></div>
        <div className="workspace-create"><input aria-label="Tên workflow mới" value={newName} onChange={(event) => setNewName(event.target.value)} /><button className="primary-button" onClick={() => { onCreate(newName.trim() || 'Workflow mới'); setNewName('Workflow mới') }}><FilePlus2 size={16} /> Tạo workflow</button></div>
      </header>
      <div className="workflow-grid">
        {workflows.map((workflow) => {
          const isEditing = editingId === workflow.id
          return (
            <article key={workflow.id} className={`workflow-card ${workflow.id === selectedId ? 'selected' : ''}`}>
              <button className="workflow-card__main" onClick={() => onSelect(workflow.id)}>
                <Workflow size={24} />
                <span><small>{workflow.id}</small><strong>{workflow.name}</strong><em>{workflow.nodes.length} nodes · {workflow.assets.length} Assets · r{workflow.revision}</em></span>
                {workflow.id === selectedId && <Check size={18} />}
              </button>
              {isEditing ? (
                <div className="workflow-card__edit"><input aria-label="Tên workflow" value={editingName} onChange={(event) => setEditingName(event.target.value)} /><button onClick={() => { onRename(workflow.id, editingName.trim() || workflow.name); setEditingId(undefined) }}><Check size={15} /> Lưu</button></div>
              ) : (
                <div className="workflow-card__actions"><button onClick={() => { setEditingId(workflow.id); setEditingName(workflow.name) }}><Pencil size={14} /> Đổi tên</button><button className="danger-text" disabled={workflows.length === 1} onClick={() => onDelete(workflow.id)}><Trash2 size={14} /> Xóa</button></div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
