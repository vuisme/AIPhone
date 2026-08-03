import {
  CheckCircle2,
  Clock3,
  CopyPlus,
  Crosshair,
  GitBranch,
  ScanSearch,
  MousePointer2,
  MoveDiagonal2,
  AudioLines,
  Play,
  Power,
  RefreshCcw,
  RotateCcw,
  Smartphone,
  Terminal,
  Trash2,
  Variable,
  XCircle,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { NodeType } from '../../contracts/workflow'

export interface NodeDefinition {
  type: NodeType
  label: string
  description: string
  category: NodeCategory
  accent: string
  icon: ComponentType<{ size?: number }>
  defaultConfig: Record<string, unknown>
  fields: NodeField[]
  outcomes?: Array<{ id: string; label: string }>
}

export type NodeCategory = 'Luồng' | 'Dữ liệu' | 'Hình ảnh' | 'Tương tác' | 'Âm thanh' | 'Ứng dụng'

export type NodeRequirement = 'NONE' | 'ACCESSIBILITY' | 'ACCESSIBILITY_OR_ROOT' | 'ROOT'

interface NodeFieldBase {
  key: string
  label: string
  hint?: string
  visibleWhen?: { key: string; equals: unknown }
  supportsVariables?: boolean
  variableInsertMode?: 'replace' | 'append'
}

export type NodeField = NodeFieldBase & (
  | { kind: 'text' | 'textarea' | 'variable' }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'range'; min: number; max: number; step: number; format: 'PERCENT' | 'NUMBER' }
  | { kind: 'checkbox' }
  | { kind: 'select'; options: Array<{ value: string | number; label: string }> }
  | { kind: 'asset'; assetType: 'IMAGE' | 'UI_SELECTOR' }
  | { kind: 'androidUser' }
  | { kind: 'ttsLanguage' | 'ttsEngine' | 'ttsVoice' }
  | { kind: 'typedValue'; typeKey: string }
)

const noFields: NodeField[] = []
const timeoutFields: NodeField[] = [
  { key: 'timeoutMs', label: 'Timeout (ms)', kind: 'number', min: 100 },
  { key: 'pollIntervalMs', label: 'Chu kỳ kiểm tra (ms)', kind: 'number', min: 100, max: 10_000 },
]
const imageAssetField: NodeField = { key: 'assetId', label: 'Asset', kind: 'asset', assetType: 'IMAGE' }
const thresholdField: NodeField = { key: 'threshold', label: 'Độ tin cậy', kind: 'range', min: 0.5, max: 1, step: 0.01, format: 'PERCENT' }
const appFields: NodeField[] = [
  { key: 'packageName', label: 'Package', hint: 'Nhập package hoặc chọn biến {{tenBien}}', kind: 'text', supportsVariables: true, variableInsertMode: 'replace' },
  { key: 'userId', label: 'Chạy trên', kind: 'androidUser' },
]

export const NODE_CATALOG: NodeDefinition[] = [
  { type: 'START', label: 'Bắt đầu', description: 'Điểm vào duy nhất', category: 'Luồng', accent: '#dcf763', icon: Play, defaultConfig: {}, fields: noFields },
  { type: 'DELAY', label: 'Chờ', description: 'Dừng theo mili giây', category: 'Luồng', accent: '#ffd38a', icon: Clock3, defaultConfig: { durationMs: 1000 }, fields: [{ key: 'durationMs', label: 'Thời gian chờ (ms)', kind: 'number', min: 0 }] },
  { type: 'LOOP', label: 'Lặp lại', description: 'Quay về một nhánh', category: 'Luồng', accent: '#ffd38a', icon: RefreshCcw, defaultConfig: { maxIterations: 0 }, fields: [{ key: 'maxIterations', label: 'Số vòng tối đa', hint: '0 = không giới hạn', kind: 'number', min: 0 }] },
  { type: 'SUCCESS', label: 'Thành công', description: 'Dừng và lưu kết quả', category: 'Luồng', accent: '#8ee3b4', icon: CheckCircle2, defaultConfig: { message: 'Đã hoàn tất' }, fields: [{ key: 'message', label: 'Thông báo', kind: 'text', supportsVariables: true, variableInsertMode: 'append' }] },
  { type: 'FAILURE', label: 'Thất bại', description: 'Dừng với lỗi', category: 'Luồng', accent: '#ff9b86', icon: XCircle, defaultConfig: { message: 'Workflow thất bại' }, fields: [{ key: 'message', label: 'Thông báo', kind: 'text', supportsVariables: true, variableInsertMode: 'append' }] },
  { type: 'SET_VARIABLE', label: 'Đặt biến', description: 'Lưu dữ liệu dùng trong run', category: 'Dữ liệu', accent: '#f0c96a', icon: Variable, defaultConfig: { name: 'value', valueType: 'STRING', value: '' }, fields: [
    { key: 'name', label: 'Tên biến', hint: 'Chữ, số và dấu gạch dưới; không bắt đầu bằng số', kind: 'text' },
    { key: 'valueType', label: 'Kiểu dữ liệu', kind: 'select', options: [{ value: 'STRING', label: 'Text' }, { value: 'NUMBER', label: 'Số' }, { value: 'BOOLEAN', label: 'Đúng / Sai' }, { value: 'JSON', label: 'JSON' }] },
    { key: 'value', label: 'Giá trị', kind: 'typedValue', typeKey: 'valueType', supportsVariables: true, variableInsertMode: 'append' },
  ] },
  { type: 'IF', label: 'Nếu / thì', description: 'So sánh biến và rẽ nhánh', category: 'Dữ liệu', accent: '#f0c96a', icon: GitBranch, defaultConfig: { leftVariable: '', operator: 'EQUALS', rightSource: 'LITERAL', rightType: 'STRING', rightValue: '' }, fields: [
    { key: 'leftVariable', label: 'Biến bên trái', kind: 'variable' },
    { key: 'operator', label: 'Điều kiện', kind: 'select', options: [
      { value: 'EQUALS', label: 'Bằng' }, { value: 'NOT_EQUALS', label: 'Khác' }, { value: 'CONTAINS', label: 'Có chứa' },
      { value: 'STARTS_WITH', label: 'Bắt đầu bằng' }, { value: 'ENDS_WITH', label: 'Kết thúc bằng' },
      { value: 'GREATER_THAN', label: 'Lớn hơn' }, { value: 'GREATER_OR_EQUAL', label: 'Lớn hơn hoặc bằng' },
      { value: 'LESS_THAN', label: 'Nhỏ hơn' }, { value: 'LESS_OR_EQUAL', label: 'Nhỏ hơn hoặc bằng' },
      { value: 'IS_EMPTY', label: 'Rỗng' }, { value: 'IS_NOT_EMPTY', label: 'Không rỗng' },
    ] },
    { key: 'rightSource', label: 'So sánh với', kind: 'select', options: [{ value: 'LITERAL', label: 'Giá trị nhập' }, { value: 'VARIABLE', label: 'Biến khác' }] },
    { key: 'rightVariable', label: 'Biến bên phải', kind: 'variable', visibleWhen: { key: 'rightSource', equals: 'VARIABLE' } },
    { key: 'rightType', label: 'Kiểu giá trị', kind: 'select', options: [{ value: 'STRING', label: 'Text' }, { value: 'NUMBER', label: 'Số' }, { value: 'BOOLEAN', label: 'Đúng / Sai' }, { value: 'JSON', label: 'JSON' }], visibleWhen: { key: 'rightSource', equals: 'LITERAL' } },
    { key: 'rightValue', label: 'Giá trị bên phải', kind: 'typedValue', typeKey: 'rightType', visibleWhen: { key: 'rightSource', equals: 'LITERAL' } },
  ], outcomes: [{ id: 'TRUE', label: 'Đúng' }, { id: 'FALSE', label: 'Sai' }] },
  { type: 'LOG', label: 'Ghi log', description: 'Ghi giá trị để kiểm tra run', category: 'Dữ liệu', accent: '#f0c96a', icon: Terminal, defaultConfig: { message: 'Giá trị: {{value}}' }, fields: [{ key: 'message', label: 'Nội dung', hint: 'Có thể chèn biến bằng {{tenBien}}', kind: 'textarea', supportsVariables: true, variableInsertMode: 'append' }] },
  { type: 'TTS_SPEAK', label: 'TTS Speak', description: 'Tạo file giọng nói và phát âm thanh', category: 'Âm thanh', accent: '#58e0c2', icon: AudioLines, defaultConfig: { text: 'Xin chào từ AIPhone', engine: '', voice: '', languageTag: 'vi-VN', speechRate: 1, pitch: 1, playAudio: false, saveAudio: true, outputVariable: 'ttsResult' }, fields: [
    { key: 'text', label: 'Nội dung đọc', hint: 'Hỗ trợ text thường và {{tenBien}}', kind: 'textarea', supportsVariables: true, variableInsertMode: 'append' },
    { key: 'languageTag', label: 'Ngôn ngữ', hint: 'Danh sách được quét trực tiếp từ điện thoại đang chọn', kind: 'ttsLanguage' },
    { key: 'engine', label: 'TTS engine', kind: 'ttsEngine' },
    { key: 'voice', label: 'Voice / model ưu tiên', hint: 'Nếu máy khác không có voice này, Agent tự chọn voice tương thích', kind: 'ttsVoice' },
    { key: 'speechRate', label: 'Tốc độ đọc', kind: 'range', min: 0.25, max: 4, step: 0.05, format: 'NUMBER' },
    { key: 'pitch', label: 'Cao độ', kind: 'range', min: 0.25, max: 2, step: 0.05, format: 'NUMBER' },
    { key: 'playAudio', label: 'Phát ngay trên điện thoại', kind: 'checkbox' },
    { key: 'saveAudio', label: 'Lưu file để nghe / tải từ kết quả', kind: 'checkbox' },
    { key: 'outputVariable', label: 'Gán kết quả vào biến', hint: 'Dùng nested path như {{ttsResult.file.path}} hoặc {{ttsResult.file.artifactId}} ở node sau', kind: 'text' },
  ] },
  { type: 'WAIT_IMAGE', label: 'Chờ Asset ảnh', description: 'Đợi ảnh mục tiêu xuất hiện', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { assetId: '', threshold: 0.88, timeoutMs: 30000, pollIntervalMs: 500 }, fields: [imageAssetField, thresholdField, ...timeoutFields], outcomes: [{ id: 'FOUND', label: 'Thấy' }, { id: 'TIMEOUT', label: 'Hết giờ' }] },
  { type: 'IF_IMAGE', label: 'Nếu thấy Asset', description: 'Rẽ nhánh Có / Không', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { assetId: '', threshold: 0.88 }, fields: [imageAssetField, thresholdField], outcomes: [{ id: 'FOUND', label: 'Có' }, { id: 'TIMEOUT', label: 'Không' }] },
  { type: 'TAP_IMAGE', label: 'Bấm Asset ảnh', description: 'Tìm, bấm và xác nhận ảnh biến mất', category: 'Hình ảnh', accent: '#73d7ff', icon: MousePointer2, defaultConfig: { assetId: '', threshold: 0.88, offsetX: 0, offsetY: 0, verifyTap: true, tapAttempts: 2, tapVerificationDelayMs: 700 }, fields: [imageAssetField, thresholdField, { key: 'verifyTap', label: 'Xác nhận ảnh biến mất sau khi bấm', kind: 'checkbox' }, { key: 'offsetX', label: 'Lệch tâm X (px)', kind: 'number' }, { key: 'offsetY', label: 'Lệch tâm Y (px)', kind: 'number' }, { key: 'tapAttempts', label: 'Số lần thử bấm', kind: 'number', min: 1, max: 5 }, { key: 'tapVerificationDelayMs', label: 'Chờ xác nhận (ms)', kind: 'number', min: 100, max: 5000 }] },
  { type: 'TAP_TEXT', label: 'Bấm theo text', description: 'Bấm node Android / WebView', category: 'Tương tác', accent: '#dff76a', icon: MousePointer2, defaultConfig: { assetId: '', timeoutMs: 10000, pollIntervalMs: 400 }, fields: [{ key: 'assetId', label: 'Asset', kind: 'asset', assetType: 'UI_SELECTOR' }, ...timeoutFields] },
  { type: 'TAP_POINT', label: 'Bấm tọa độ', description: 'Tap tại vị trí X / Y', category: 'Tương tác', accent: '#dff76a', icon: Crosshair, defaultConfig: { x: 0, y: 0 }, fields: [{ key: 'x', label: 'Tọa độ X', kind: 'number', min: 0 }, { key: 'y', label: 'Tọa độ Y', kind: 'number', min: 0 }] },
  { type: 'SWIPE', label: 'Vuốt màn hình', description: 'Swipe giữa hai tọa độ', category: 'Tương tác', accent: '#dff76a', icon: MoveDiagonal2, defaultConfig: { x1: 0, y1: 0, x2: 0, y2: 0, durationMs: 400 }, fields: [{ key: 'x1', label: 'Điểm đầu X', kind: 'number', min: 0 }, { key: 'y1', label: 'Điểm đầu Y', kind: 'number', min: 0 }, { key: 'x2', label: 'Điểm cuối X', kind: 'number', min: 0 }, { key: 'y2', label: 'Điểm cuối Y', kind: 'number', min: 0 }, { key: 'durationMs', label: 'Thời gian vuốt (ms)', kind: 'number', min: 1, max: 60000 }] },
  { type: 'CREATE_CLONE', label: 'Tạo app kép', description: 'Cài package vào XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: CopyPlus, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'LAUNCH_APP', label: 'Mở ứng dụng', description: 'Khởi chạy package', category: 'Ứng dụng', accent: '#ffb35c', icon: Smartphone, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'FORCE_STOP_APP', label: 'Buộc dừng ứng dụng', description: 'Force-stop package theo Android user', category: 'Ứng dụng', accent: '#ff9b86', icon: Power, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 0 }, fields: appFields },
  { type: 'CLEAR_CLONE', label: 'Xóa dữ liệu kép', description: 'Reset dữ liệu XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: RotateCcw, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'DELETE_CLONE', label: 'Xóa app kép', description: 'Gỡ package khỏi XSpace', category: 'Ứng dụng', accent: '#ff9b86', icon: Trash2, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
]

export const nodeDefinition = (type: NodeType) => NODE_CATALOG.find((item) => item.type === type) ?? NODE_CATALOG[0]

export function nodeRequirement(type: NodeType, config: Record<string, unknown>): NodeRequirement {
  if (['WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE', 'TAP_POINT', 'SWIPE'].includes(type)) return 'ACCESSIBILITY_OR_ROOT'
  if (type === 'TAP_TEXT') return 'ACCESSIBILITY'
  if (['CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE', 'FORCE_STOP_APP'].includes(type)) return 'ROOT'
  if (type === 'LAUNCH_APP') {
    if (typeof config.userId === 'string' && config.userId.includes('{{')) return 'NONE'
    return Number(config.userId ?? 999) === 0 ? 'NONE' : 'ROOT'
  }
  return 'NONE'
}

export function nodeRequirementLabel(type: NodeType, config: Record<string, unknown>): string {
  return {
    NONE: 'KHÔNG YÊU CẦU ROOT',
    ACCESSIBILITY: 'TRỢ NĂNG',
    ACCESSIBILITY_OR_ROOT: 'ROOT / TRỢ NĂNG',
    ROOT: 'ROOT',
  }[nodeRequirement(type, config)]
}

export function rootBadgeLabel(type: NodeType, config: Record<string, unknown>): 'ROOT' | undefined {
  return nodeRequirement(type, config) === 'ROOT' ? 'ROOT' : undefined
}
