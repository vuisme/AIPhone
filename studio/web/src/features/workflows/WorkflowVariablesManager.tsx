import { Braces, Plus, Trash2, Variable } from 'lucide-react'
import type { WorkflowDocument, WorkflowParameter, WorkflowValueType } from '../../contracts/workflow'

interface WorkflowVariablesManagerProps {
  workflow: WorkflowDocument
  onChange: (workflow: WorkflowDocument) => void
}

function defaultValue(type: WorkflowValueType): unknown {
  if (type === 'NUMBER') return 0
  if (type === 'BOOLEAN') return false
  if (type === 'JSON') return null
  return ''
}

function VariableValue({ variable, onChange }: { variable: WorkflowParameter; onChange: (value: unknown) => void }) {
  if (variable.type === 'BOOLEAN') return <select value={String(variable.defaultValue === true)} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">Đúng</option><option value="false">Sai</option></select>
  if (variable.type === 'NUMBER') return <input aria-label={`Giá trị mặc định ${variable.name}`} type="number" value={Number(variable.defaultValue ?? 0)} onChange={(event) => onChange(Number(event.target.value))} />
  if (variable.type === 'JSON') return <textarea aria-label={`Giá trị mặc định ${variable.name}`} rows={3} value={typeof variable.defaultValue === 'string' ? variable.defaultValue : JSON.stringify(variable.defaultValue ?? null, null, 2)} onChange={(event) => onChange(event.target.value)} />
  return <input aria-label={`Giá trị mặc định ${variable.name}`} value={String(variable.defaultValue ?? '')} onChange={(event) => onChange(event.target.value)} />
}

export function WorkflowVariablesManager({ workflow, onChange }: WorkflowVariablesManagerProps) {
  const publish = (parameters: WorkflowParameter[]) => onChange({ ...workflow, parameters, revision: workflow.revision + 1, updatedAt: new Date().toISOString() })
  const update = (index: number, patch: Partial<WorkflowParameter>) => publish(workflow.parameters.map((variable, current) => current === index ? { ...variable, ...patch } : variable))
  const add = () => {
    let index = workflow.parameters.length + 1
    while (workflow.parameters.some((variable) => variable.name === `variable_${index}`)) index++
    publish([...workflow.parameters, { name: `variable_${index}`, type: 'STRING', defaultValue: '', description: '' }])
  }
  const runtimeVariables = workflow.nodes.filter((node) => node.type === 'SET_VARIABLE').map((node) => ({
    nodeId: node.id,
    name: String(node.config.name ?? ''),
    type: String(node.config.valueType ?? 'STRING'),
    value: node.config.value,
    disabled: node.disabled === true,
  }))

  return (
    <section className="workspace-page variables-manager" aria-labelledby="variables-title">
      <header className="workspace-page__header">
        <div><span>WORKFLOW DATA</span><h2 id="variables-title">Biến của {workflow.name}</h2><p>Dùng cú pháp <code>{'{{tenBien}}'}</code> trong các field có nút “Chèn biến”.</p></div>
        <button className="primary-button" onClick={add}><Plus size={16} /> Thêm biến toàn cục</button>
      </header>

      <section className="variable-section">
        <div className="variable-section__heading"><Variable size={18} /><div><h3>Biến toàn cục</h3><p>Có sẵn ngay khi workflow bắt đầu và được đồng bộ cùng workflow xuống mọi điện thoại.</p></div><strong>{workflow.parameters.length}</strong></div>
        {workflow.parameters.length === 0 ? <div className="variable-empty">Chưa có biến toàn cục. Thêm biến nếu nhiều node cần dùng chung một giá trị.</div> : <div className="global-variable-list">
          {workflow.parameters.map((variable, index) => <article className="global-variable-row" key={`${variable.name}-${index}`}>
            <div className="variable-token"><Braces size={16} /><code>{`{{${variable.name}}}`}</code></div>
            <label>Tên biến<input aria-label={`Tên biến ${index + 1}`} value={variable.name} onChange={(event) => update(index, { name: event.target.value })} /></label>
            <label>Kiểu<select value={variable.type} onChange={(event) => { const type = event.target.value as WorkflowValueType; update(index, { type, defaultValue: defaultValue(type) }) }}><option value="STRING">Text</option><option value="NUMBER">Số</option><option value="BOOLEAN">Đúng / Sai</option><option value="JSON">JSON</option></select></label>
            <label>Giá trị mặc định<VariableValue variable={variable} onChange={(value) => update(index, { defaultValue: value })} /></label>
            <label>Mô tả<input value={variable.description ?? ''} placeholder="Biến này dùng cho việc gì?" onChange={(event) => update(index, { description: event.target.value })} /></label>
            <button className="variable-delete" aria-label={`Xóa biến ${variable.name}`} onClick={() => publish(workflow.parameters.filter((_, current) => current !== index))}><Trash2 size={15} /></button>
          </article>)}
        </div>}
      </section>

      <section className="variable-section">
        <div className="variable-section__heading"><Braces size={18} /><div><h3>Biến được tạo khi chạy</h3><p>Danh sách chỉ để tra cứu. Giá trị chỉ tồn tại sau khi node “Đặt biến” tương ứng đã chạy.</p></div><strong>{runtimeVariables.length}</strong></div>
        {runtimeVariables.length === 0 ? <div className="variable-empty">Chưa có node “Đặt biến” trong workflow.</div> : <div className="runtime-variable-list">
          {runtimeVariables.map((variable) => <article key={variable.nodeId} className={variable.disabled ? 'disabled' : ''}><code>{`{{${variable.name}}}`}</code><span>{variable.type}</span><strong>{String(variable.value ?? '') || '—'}</strong><small>{variable.nodeId}{variable.disabled ? ' · đang skip' : ''}</small></article>)}
        </div>}
      </section>
    </section>
  )
}
