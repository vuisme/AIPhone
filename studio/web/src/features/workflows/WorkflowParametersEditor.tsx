import { Plus, Trash2 } from 'lucide-react'
import type { WorkflowParameter, WorkflowValueType } from '../../contracts/workflow'

interface WorkflowParametersEditorProps {
  parameters: WorkflowParameter[]
  onChange: (parameters: WorkflowParameter[]) => void
}

function defaultValue(type: WorkflowValueType): unknown {
  if (type === 'NUMBER') return 0
  if (type === 'BOOLEAN') return false
  if (type === 'JSON') return null
  return ''
}

function ParameterValue({ parameter, onChange }: { parameter: WorkflowParameter; onChange: (value: unknown) => void }) {
  if (parameter.type === 'BOOLEAN') return <select value={String(parameter.defaultValue === true)} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">Đúng</option><option value="false">Sai</option></select>
  if (parameter.type === 'NUMBER') return <input aria-label={`Giá trị mặc định ${parameter.name}`} type="number" value={Number(parameter.defaultValue ?? 0)} onChange={(event) => onChange(Number(event.target.value))} />
  if (parameter.type === 'JSON') return <textarea aria-label={`Giá trị mặc định ${parameter.name}`} rows={3} value={typeof parameter.defaultValue === 'string' ? parameter.defaultValue : JSON.stringify(parameter.defaultValue ?? null)} onChange={(event) => onChange(event.target.value)} />
  return <input aria-label={`Giá trị mặc định ${parameter.name}`} value={String(parameter.defaultValue ?? '')} onChange={(event) => onChange(event.target.value)} />
}

export function WorkflowParametersEditor({ parameters, onChange }: WorkflowParametersEditorProps) {
  const update = (index: number, patch: Partial<WorkflowParameter>) => onChange(parameters.map((parameter, current) => current === index ? { ...parameter, ...patch } : parameter))
  const add = () => {
    let index = parameters.length + 1
    while (parameters.some((parameter) => parameter.name === `input_${index}`)) index++
    onChange([...parameters, { name: `input_${index}`, type: 'STRING', defaultValue: '' }])
  }

  return (
    <section className="workflow-parameters">
      <header><div><span>RUN INPUTS</span><small>Giá trị khởi tạo khi workflow bắt đầu</small></div><button type="button" onClick={add}><Plus size={13} /> Thêm</button></header>
      {parameters.length === 0 ? <p>Chưa có input. Node Đặt biến vẫn có thể tạo dữ liệu trong khi chạy.</p> : parameters.map((parameter, index) => (
        <div className="workflow-parameter" key={index}>
          <input aria-label={`Tên input ${index + 1}`} value={parameter.name} onChange={(event) => update(index, { name: event.target.value })} />
          <select aria-label={`Kiểu input ${parameter.name}`} value={parameter.type} onChange={(event) => { const type = event.target.value as WorkflowValueType; update(index, { type, defaultValue: defaultValue(type) }) }}>
            <option value="STRING">Text</option><option value="NUMBER">Số</option><option value="BOOLEAN">Đúng / Sai</option><option value="JSON">JSON</option>
          </select>
          <ParameterValue parameter={parameter} onChange={(value) => update(index, { defaultValue: value })} />
          <button type="button" aria-label={`Xóa input ${parameter.name}`} onClick={() => onChange(parameters.filter((_, current) => current !== index))}><Trash2 size={13} /></button>
        </div>
      ))}
    </section>
  )
}
