import type { AssetRecord, NodeType, WorkflowValueType } from '../../contracts/workflow'
import type { NodeDefinition, NodeField } from './nodeCatalog'
import { androidUserOptions } from './androidUsers'

interface NodeInspectorFieldsProps {
  definition: NodeDefinition
  nodeType: NodeType
  config: Record<string, unknown>
  assets: AssetRecord[]
  variables: string[]
  onChange: (key: string, value: unknown) => void
}

function insertVariable(current: string, name: string, mode: 'replace' | 'append' = 'append'): string {
  const token = `{{${name}}}`
  if (mode === 'replace') return token
  if (!current) return token
  return `${current}${/\s$/.test(current) ? '' : ' '}${token}`
}

function TemplateControl({ value, variables, multiline = false, mode, onChange }: {
  value: string
  variables: string[]
  multiline?: boolean
  mode?: 'replace' | 'append'
  onChange: (value: string) => void
}) {
  return <div className="variable-template-control">
    {multiline
      ? <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      : <input value={value} onChange={(event) => onChange(event.target.value)} />}
    <select aria-label="Chèn biến" value="" disabled={variables.length === 0} onChange={(event) => { if (event.target.value) onChange(insertVariable(value, event.target.value, mode)) }}>
      <option value="">{variables.length ? 'Chèn biến...' : 'Chưa khai báo biến'}</option>
      {variables.map((name) => <option key={name} value={name}>{`{{${name}}}`}</option>)}
    </select>
  </div>
}

function typedValue(field: Extract<NodeField, { kind: 'typedValue' }>, props: NodeInspectorFieldsProps) {
  const { config, onChange } = props
  const type = String(config[field.typeKey] ?? 'STRING') as WorkflowValueType
  const value = config[field.key]
  if (type === 'BOOLEAN') {
    return <select value={String(value === true)} onChange={(event) => onChange(field.key, event.target.value === 'true')}><option value="true">Đúng</option><option value="false">Sai</option></select>
  }
  if (type === 'NUMBER') {
    return <input type="number" value={Number(value ?? 0)} onChange={(event) => onChange(field.key, Number(event.target.value))} />
  }
  if (type === 'JSON') {
    const display = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)
    return <textarea rows={5} value={display} onChange={(event) => onChange(field.key, event.target.value)} spellCheck={false} />
  }
  if (field.supportsVariables) return <TemplateControl value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => onChange(field.key, next)} />
  return <input value={String(value ?? '')} onChange={(event) => onChange(field.key, event.target.value)} />
}

function fieldControl(field: NodeField, props: NodeInspectorFieldsProps) {
  const value = props.config[field.key]
  switch (field.kind) {
    case 'asset':
      return (
        <select value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>
          <option value="">Chọn Asset...</option>
          {props.assets.filter((asset) => asset.type === field.assetType).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      )
    case 'androidUser':
      return <select value={Number(value)} onChange={(event) => props.onChange(field.key, Number(event.target.value))}>{androidUserOptions(props.nodeType).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    case 'checkbox':
      return <input type="checkbox" checked={value !== false} onChange={(event) => props.onChange(field.key, event.target.checked)} />
    case 'number':
      return <input type="number" min={field.min} max={field.max} step={field.step} value={Number(value ?? 0)} onChange={(event) => props.onChange(field.key, Number(event.target.value))} />
    case 'range':
      return <div className="range-row"><input type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={(event) => props.onChange(field.key, Number(event.target.value))} /><output>{field.format === 'PERCENT' ? `${Math.round(Number(value) * 100)}%` : String(value)}</output></div>
    case 'select':
      return <select value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}</select>
    case 'variable':
      return <select value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}><option value="">Chọn biến...</option>{props.variables.map((name) => <option key={name} value={name}>{name}</option>)}</select>
    case 'textarea':
      return field.supportsVariables
        ? <TemplateControl multiline value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => props.onChange(field.key, next)} />
        : <textarea rows={4} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)} />
    case 'typedValue':
      return typedValue(field, props)
    case 'text':
      return field.supportsVariables
        ? <TemplateControl value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => props.onChange(field.key, next)} />
        : <input value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)} />
  }
}

export function NodeInspectorFields(props: NodeInspectorFieldsProps) {
  return props.definition.fields.map((field) => {
    if (field.visibleWhen && props.config[field.visibleWhen.key] !== field.visibleWhen.equals) return null
    const isCheckbox = field.kind === 'checkbox'
    return (
      <label className={isCheckbox ? 'checkbox-label' : undefined} key={field.key}>
        {isCheckbox ? <>{fieldControl(field, props)} {field.label}</> : <>{field.label}{fieldControl(field, props)}</>}
        {field.hint && <small>{field.hint}</small>}
      </label>
    )
  })
}
