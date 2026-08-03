import { Braces, Crosshair, MoveDiagonal2, RefreshCw } from 'lucide-react'
import type { AssetRecord, NodeType, WorkflowValueType } from '../../contracts/workflow'
import type { TtsCapabilities } from '../../api/client'
import type { NodeDefinition, NodeField } from './nodeCatalog'
import { androidUserOptions } from './androidUsers'
import { languageDisplayName, voiceDisplayLabel } from './ttsPresentation'

interface NodeInspectorFieldsProps {
  definition: NodeDefinition
  nodeType: NodeType
  config: Record<string, unknown>
  assets: AssetRecord[]
  variables: string[]
  ttsCapabilities?: TtsCapabilities
  ttsCapabilitiesLoading?: boolean
  ttsCapabilitiesError?: string
  onRefreshTtsCapabilities?: () => void
  onPickCoordinates?: () => void
  onChange: (key: string, value: unknown) => void
}

function insertVariable(current: string, name: string, mode: 'replace' | 'append' = 'append'): string {
  const token = `{{${name}}}`
  if (mode === 'replace') return token
  if (!current) return token
  return `${current}${/\s$/.test(current) ? '' : ' '}${token}`
}

function TemplateControl({ id, value, variables, multiline = false, mode, onChange }: {
  id?: string
  value: string
  variables: string[]
  multiline?: boolean
  mode?: 'replace' | 'append'
  onChange: (value: string) => void
}) {
  return <div className="variable-template-control">
    {multiline
      ? <textarea id={id} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
    <select aria-label="Chèn biến" value="" disabled={variables.length === 0} onChange={(event) => { if (event.target.value) onChange(insertVariable(value, event.target.value, mode)) }}>
      <option value="">{variables.length ? 'Chèn biến...' : 'Chưa khai báo biến'}</option>
      {variables.map((name) => <option key={name} value={name}>{`{{${name}}}`}</option>)}
    </select>
  </div>
}

function typedValue(field: Extract<NodeField, { kind: 'typedValue' }>, props: NodeInspectorFieldsProps, id: string) {
  const { config, onChange } = props
  const type = String(config[field.typeKey] ?? 'STRING') as WorkflowValueType
  const value = config[field.key]
  if (type === 'BOOLEAN') {
    return <select id={id} value={String(value === true)} onChange={(event) => onChange(field.key, event.target.value === 'true')}><option value="true">Đúng</option><option value="false">Sai</option></select>
  }
  if (type === 'NUMBER') {
    return <input id={id} type="number" value={Number(value ?? 0)} onChange={(event) => onChange(field.key, Number(event.target.value))} />
  }
  if (type === 'JSON') {
    const display = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)
    return <textarea id={id} rows={5} value={display} onChange={(event) => onChange(field.key, event.target.value)} spellCheck={false} />
  }
  if (field.supportsVariables) return <TemplateControl id={id} value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => onChange(field.key, next)} />
  return <input id={id} value={String(value ?? '')} onChange={(event) => onChange(field.key, event.target.value)} />
}

function fieldControl(field: NodeField, props: NodeInspectorFieldsProps, id: string) {
  const value = props.config[field.key]
  switch (field.kind) {
    case 'asset':
      return (
        <select id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>
          <option value="">Chọn Asset...</option>
          {props.assets.filter((asset) => asset.type === field.assetType).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      )
    case 'androidUser':
      return <select id={id} value={Number(value)} onChange={(event) => props.onChange(field.key, Number(event.target.value))}>{androidUserOptions(props.nodeType).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    case 'ttsLanguage': {
      const current = String(value ?? 'vi-VN')
      const languages = Array.from(new Set((props.ttsCapabilities?.engines ?? []).flatMap((engine) => engine.voices.map((voice) => voice.languageTag)))).sort()
      if (current && !languages.includes(current)) languages.unshift(current)
      if (languages.length === 0) return <input id={id} value={current} placeholder="vi-VN" onChange={(event) => props.onChange(field.key, event.target.value)} />
      return <select id={id} value={current} onChange={(event) => props.onChange(field.key, event.target.value)}>
        {languages.map((languageTag) => <option key={languageTag} value={languageTag}>{languageDisplayName(languageTag)} · {languageTag}</option>)}
      </select>
    }
    case 'ttsEngine':
      return <select id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>
        <option value="">Android mặc định{props.ttsCapabilities?.defaultEngine ? ` · ${props.ttsCapabilities.defaultEngine}` : ''}</option>
        {(props.ttsCapabilities?.engines ?? []).map((engine) => <option key={engine.packageName} value={engine.packageName}>{engine.label} · {engine.packageName}</option>)}
      </select>
    case 'ttsVoice': {
      const selectedEngine = String(props.config.engine ?? '') || props.ttsCapabilities?.defaultEngine
      const languageTag = String(props.config.languageTag ?? '').toLowerCase()
      const language = languageTag.split('-')[0]
      const voices = (props.ttsCapabilities?.engines ?? [])
        .filter((engine) => !selectedEngine || engine.packageName === selectedEngine)
        .flatMap((engine) => engine.voices)
        .filter((voice) => !language || voice.languageTag.toLowerCase().split('-')[0] === language)
      return <select id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>
        <option value="">Tự chọn voice tương thích (khuyên dùng)</option>
        {String(value ?? '') && !voices.some((voice) => voice.name === value) && <option value={String(value)}>Không có trên máy này · {String(value)}</option>}
        {voices.map((voice) => <option key={voice.name} value={voice.name}>{voiceDisplayLabel(voice)}</option>)}
      </select>
    }
    case 'checkbox':
      return <input id={id} type="checkbox" checked={value !== false} onChange={(event) => props.onChange(field.key, event.target.checked)} />
    case 'number':
      return <input id={id} type="number" min={field.min} max={field.max} step={field.step} value={Number(value ?? 0)} onChange={(event) => props.onChange(field.key, Number(event.target.value))} />
    case 'range':
      return <div className="range-row"><input id={id} type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={(event) => props.onChange(field.key, Number(event.target.value))} /><output>{field.format === 'PERCENT' ? `${Math.round(Number(value) * 100)}%` : String(value)}</output></div>
    case 'select':
      return <select id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}</select>
    case 'variable':
      return <select id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)}><option value="">Chọn biến...</option>{props.variables.map((name) => <option key={name} value={name}>{name}</option>)}</select>
    case 'textarea':
      return field.supportsVariables
        ? <TemplateControl id={id} multiline value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => props.onChange(field.key, next)} />
        : <textarea id={id} rows={4} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)} />
    case 'typedValue':
      return typedValue(field, props, id)
    case 'text':
      return field.supportsVariables
        ? <TemplateControl id={id} value={String(value ?? '')} variables={props.variables} mode={field.variableInsertMode} onChange={(next) => props.onChange(field.key, next)} />
        : <input id={id} value={String(value ?? '')} onChange={(event) => props.onChange(field.key, event.target.value)} />
  }
}

function isExpressionValue(value: unknown): value is string {
  return typeof value === 'string' && value.includes('{{') && value.includes('}}')
}

function expressionSeed(value: unknown): string {
  if (typeof value === 'string') return value ? `{{ ${JSON.stringify(value)} }}` : '{{  }}'
  if (value === undefined) return '{{  }}'
  return `{{ ${JSON.stringify(value)} }}`
}

function ExpressionControl({ id, field, props }: { id: string; field: NodeField; props: NodeInspectorFieldsProps }) {
  const value = String(props.config[field.key] ?? '{{  }}')
  const multiline = field.kind === 'textarea' || (field.kind === 'typedValue' && props.config[field.typeKey] === 'JSON')
  return <div className="expression-control">
    {multiline
      ? <textarea id={id} aria-label={`Expression cho ${field.label}`} rows={4} value={value} spellCheck={false} onChange={(event) => props.onChange(field.key, event.target.value)} />
      : <input id={id} aria-label={`Expression cho ${field.label}`} value={value} spellCheck={false} onChange={(event) => props.onChange(field.key, event.target.value)} />}
    <div className="expression-assist"><select aria-label={`Chèn biến vào ${field.label}`} value="" disabled={props.variables.length === 0} onChange={(event) => { if (event.target.value) props.onChange(field.key, `{{ ${event.target.value} }}`) }}><option value="">{props.variables.length ? 'Chèn biến...' : 'Chưa có biến'}</option>{props.variables.map((name) => <option key={name} value={name}>{name}</option>)}</select><span><code>random(min, max)</code><small> · JavaScript an toàn trong {'{{ ... }}'}</small></span></div>
  </div>
}

export function NodeInspectorFields(props: NodeInspectorFieldsProps) {
  const voiceCount = props.ttsCapabilities?.engines.reduce((total, engine) => total + engine.voices.length, 0) ?? 0
  return <>
    {props.nodeType === 'TAP_POINT' && <button type="button" className="coordinate-picker-launch" onClick={props.onPickCoordinates} disabled={!props.onPickCoordinates} aria-label="Lấy điểm chạm từ Capture Lab"><Crosshair size={16} /><span><strong>Lấy tọa độ từ màn hình</strong><small>Mở Capture Lab và bấm một điểm</small></span></button>}
    {props.nodeType === 'SWIPE' && <button type="button" className="coordinate-picker-launch" onClick={props.onPickCoordinates} disabled={!props.onPickCoordinates} aria-label="Lấy hướng vuốt từ Capture Lab"><MoveDiagonal2 size={16} /><span><strong>Lấy hướng vuốt từ màn hình</strong><small>Kéo điểm đầu đến điểm cuối trong Capture Lab</small></span></button>}
    {props.nodeType === 'TTS_SPEAK' && <section className="tts-capability-summary" aria-live="polite">
      <div><span>MODEL SOURCE</span><strong>{props.ttsCapabilities ? `${props.ttsCapabilities.engines.length} engine · ${voiceCount} voice trên máy đang chọn` : 'Chưa có dữ liệu từ điện thoại'}</strong>{props.ttsCapabilitiesError && <small>{props.ttsCapabilitiesError}</small>}</div>
      <button type="button" onClick={props.onRefreshTtsCapabilities} disabled={props.ttsCapabilitiesLoading || !props.onRefreshTtsCapabilities} aria-label="Quét lại TTS model trên điện thoại"><RefreshCw size={13} className={props.ttsCapabilitiesLoading ? 'spin' : ''} /></button>
    </section>}
    {props.definition.fields.map((field) => {
      if (field.visibleWhen && props.config[field.visibleWhen.key] !== field.visibleWhen.equals && !isExpressionValue(props.config[field.visibleWhen.key])) return null
      const expression = isExpressionValue(props.config[field.key])
      const isCheckbox = field.kind === 'checkbox' && !expression
      const id = `node-field-${field.key}`
      const toggleExpression = () => props.onChange(field.key, expression ? props.definition.defaultConfig[field.key] : expressionSeed(props.config[field.key]))
      return (
        <div className={`inspector-field ${isCheckbox ? 'checkbox-field' : ''}`} key={field.key}>
          <div className="inspector-field__heading">{isCheckbox && fieldControl(field, props, id)}<label htmlFor={id}>{field.label}</label><button type="button" className={expression ? 'active' : ''} onClick={toggleExpression} aria-label={`${expression ? 'Dùng giá trị cố định cho' : 'Dùng expression cho'} ${field.label}`} title={expression ? 'Trở về giá trị cố định' : 'Dùng JavaScript expression'}><Braces size={12} /><span>fx</span></button></div>
          {!isCheckbox && (expression ? <ExpressionControl id={id} field={field} props={props} /> : fieldControl(field, props, id))}
          {field.hint && <small>{field.hint}</small>}
        </div>
      )
    })}
  </>
}
