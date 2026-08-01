import {
  CheckCircle2,
  Clock3,
  CopyPlus,
  GitBranch,
  ScanSearch,
  MousePointer2,
  Play,
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

export type NodeCategory = 'Luồng' | 'Dữ liệu' | 'Hình ảnh' | 'Ứng dụng'

interface NodeFieldBase {
  key: string
  label: string
  hint?: string
  visibleWhen?: { key: string; equals: unknown }
}

export type NodeField = NodeFieldBase & (
  | { kind: 'text' | 'textarea' | 'variable' }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'range'; min: number; max: number; step: number; format: 'PERCENT' | 'NUMBER' }
  | { kind: 'checkbox' }
  | { kind: 'select'; options: Array<{ value: string | number; label: string }> }
  | { kind: 'asset'; assetType: 'IMAGE' | 'UI_SELECTOR' }
  | { kind: 'androidUser' }
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
  { key: 'packageName', label: 'Package', kind: 'text' },
  { key: 'userId', label: 'Chạy trên', kind: 'androidUser' },
]

export const NODE_CATALOG: NodeDefinition[] = [
  { type: 'START', label: 'Bắt đầu', description: 'Điểm vào duy nhất', category: 'Luồng', accent: '#dcf763', icon: Play, defaultConfig: {}, fields: noFields },
  { type: 'DELAY', label: 'Chờ', description: 'Dừng theo mili giây', category: 'Luồng', accent: '#ffd38a', icon: Clock3, defaultConfig: { durationMs: 1000 }, fields: [{ key: 'durationMs', label: 'Thời gian chờ (ms)', kind: 'number', min: 0 }] },
  { type: 'LOOP', label: 'Lặp lại', description: 'Quay về một nhánh', category: 'Luồng', accent: '#ffd38a', icon: RefreshCcw, defaultConfig: { maxIterations: 0 }, fields: [{ key: 'maxIterations', label: 'Số vòng tối đa', hint: '0 = không giới hạn', kind: 'number', min: 0 }] },
  { type: 'SUCCESS', label: 'Thành công', description: 'Dừng và lưu kết quả', category: 'Luồng', accent: '#8ee3b4', icon: CheckCircle2, defaultConfig: { message: 'Đã hoàn tất' }, fields: [{ key: 'message', label: 'Thông báo', kind: 'text' }] },
  { type: 'FAILURE', label: 'Thất bại', description: 'Dừng với lỗi', category: 'Luồng', accent: '#ff9b86', icon: XCircle, defaultConfig: { message: 'Workflow thất bại' }, fields: [{ key: 'message', label: 'Thông báo', kind: 'text' }] },
  { type: 'SET_VARIABLE', label: 'Đặt biến', description: 'Lưu dữ liệu dùng trong run', category: 'Dữ liệu', accent: '#f0c96a', icon: Variable, defaultConfig: { name: 'value', valueType: 'STRING', value: '' }, fields: [
    { key: 'name', label: 'Tên biến', hint: 'Chữ, số và dấu gạch dưới; không bắt đầu bằng số', kind: 'text' },
    { key: 'valueType', label: 'Kiểu dữ liệu', kind: 'select', options: [{ value: 'STRING', label: 'Text' }, { value: 'NUMBER', label: 'Số' }, { value: 'BOOLEAN', label: 'Đúng / Sai' }, { value: 'JSON', label: 'JSON' }] },
    { key: 'value', label: 'Giá trị', kind: 'typedValue', typeKey: 'valueType' },
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
  { type: 'LOG', label: 'Ghi log', description: 'Ghi giá trị để kiểm tra run', category: 'Dữ liệu', accent: '#f0c96a', icon: Terminal, defaultConfig: { message: 'Giá trị: {{value}}' }, fields: [{ key: 'message', label: 'Nội dung', hint: 'Có thể chèn biến bằng {{tenBien}}', kind: 'textarea' }] },
  { type: 'WAIT_IMAGE', label: 'Chờ Asset ảnh', description: 'Đợi ảnh mục tiêu xuất hiện', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { assetId: '', threshold: 0.88, timeoutMs: 30000, pollIntervalMs: 500 }, fields: [imageAssetField, thresholdField, ...timeoutFields], outcomes: [{ id: 'FOUND', label: 'Thấy' }, { id: 'TIMEOUT', label: 'Hết giờ' }] },
  { type: 'IF_IMAGE', label: 'Nếu thấy Asset', description: 'Rẽ nhánh Có / Không', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { assetId: '', threshold: 0.88 }, fields: [imageAssetField, thresholdField], outcomes: [{ id: 'FOUND', label: 'Có' }, { id: 'TIMEOUT', label: 'Không' }] },
  { type: 'TAP_IMAGE', label: 'Bấm Asset ảnh', description: 'Tìm, bấm và xác nhận ảnh biến mất', category: 'Hình ảnh', accent: '#73d7ff', icon: MousePointer2, defaultConfig: { assetId: '', threshold: 0.88, offsetX: 0, offsetY: 0, verifyTap: true, tapAttempts: 2, tapVerificationDelayMs: 700 }, fields: [imageAssetField, thresholdField, { key: 'verifyTap', label: 'Xác nhận ảnh biến mất sau khi bấm', kind: 'checkbox' }, { key: 'offsetX', label: 'Lệch tâm X (px)', kind: 'number' }, { key: 'offsetY', label: 'Lệch tâm Y (px)', kind: 'number' }, { key: 'tapAttempts', label: 'Số lần thử bấm', kind: 'number', min: 1, max: 5 }, { key: 'tapVerificationDelayMs', label: 'Chờ xác nhận (ms)', kind: 'number', min: 100, max: 5000 }] },
  { type: 'TAP_TEXT', label: 'Bấm theo text', description: 'Bấm node Android / WebView', category: 'Hình ảnh', accent: '#dff76a', icon: MousePointer2, defaultConfig: { assetId: '', timeoutMs: 10000, pollIntervalMs: 400 }, fields: [{ key: 'assetId', label: 'Asset', kind: 'asset', assetType: 'UI_SELECTOR' }, ...timeoutFields] },
  { type: 'CREATE_CLONE', label: 'Tạo app kép', description: 'Cài package vào XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: CopyPlus, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'LAUNCH_APP', label: 'Mở ứng dụng', description: 'Khởi chạy package', category: 'Ứng dụng', accent: '#ffb35c', icon: Smartphone, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'CLEAR_CLONE', label: 'Xóa dữ liệu kép', description: 'Reset dữ liệu XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: RotateCcw, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
  { type: 'DELETE_CLONE', label: 'Xóa app kép', description: 'Gỡ package khỏi XSpace', category: 'Ứng dụng', accent: '#ff9b86', icon: Trash2, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 }, fields: appFields },
]

export const nodeDefinition = (type: NodeType) => NODE_CATALOG.find((item) => item.type === type) ?? NODE_CATALOG[0]
