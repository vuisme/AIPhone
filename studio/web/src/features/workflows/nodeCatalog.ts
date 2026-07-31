import {
  CheckCircle2,
  Clock3,
  CopyPlus,
  ScanSearch,
  MousePointer2,
  Play,
  RefreshCcw,
  RotateCcw,
  Smartphone,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { NodeType } from '../../contracts/workflow'

export interface NodeDefinition {
  type: NodeType
  label: string
  description: string
  category: 'Luồng' | 'Hình ảnh' | 'Ứng dụng'
  accent: string
  icon: ComponentType<{ size?: number }>
  defaultConfig: Record<string, unknown>
}

export const NODE_CATALOG: NodeDefinition[] = [
  { type: 'START', label: 'Bắt đầu', description: 'Điểm vào duy nhất', category: 'Luồng', accent: '#dcf763', icon: Play, defaultConfig: {} },
  { type: 'DELAY', label: 'Chờ', description: 'Dừng theo mili giây', category: 'Luồng', accent: '#ffd38a', icon: Clock3, defaultConfig: { durationMs: 1000 } },
  { type: 'LOOP', label: 'Lặp lại', description: 'Quay về một nhánh', category: 'Luồng', accent: '#ffd38a', icon: RefreshCcw, defaultConfig: { maxIterations: 0 } },
  { type: 'SUCCESS', label: 'Thành công', description: 'Dừng và lưu kết quả', category: 'Luồng', accent: '#8ee3b4', icon: CheckCircle2, defaultConfig: { message: 'Đã hoàn tất' } },
  { type: 'FAILURE', label: 'Thất bại', description: 'Dừng với lỗi', category: 'Luồng', accent: '#ff9b86', icon: XCircle, defaultConfig: { message: 'Workflow thất bại' } },
  { type: 'WAIT_IMAGE', label: 'Chờ hình ảnh', description: 'Đợi template xuất hiện', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { templateId: '', threshold: 0.88, timeoutMs: 30000, pollIntervalMs: 500 } },
  { type: 'IF_IMAGE', label: 'Nếu thấy ảnh', description: 'Rẽ nhánh Có / Không', category: 'Hình ảnh', accent: '#73d7ff', icon: ScanSearch, defaultConfig: { templateId: '', threshold: 0.88 } },
  { type: 'TAP_IMAGE', label: 'Bấm vào ảnh', description: 'Tìm rồi bấm tâm ảnh', category: 'Hình ảnh', accent: '#73d7ff', icon: MousePointer2, defaultConfig: { templateId: '', threshold: 0.88, offsetX: 0, offsetY: 0 } },
  { type: 'CREATE_CLONE', label: 'Tạo app kép', description: 'Cài package vào XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: CopyPlus, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 } },
  { type: 'LAUNCH_APP', label: 'Mở ứng dụng', description: 'Khởi chạy package', category: 'Ứng dụng', accent: '#ffb35c', icon: Smartphone, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 } },
  { type: 'CLEAR_CLONE', label: 'Xóa dữ liệu kép', description: 'Reset dữ liệu XSpace', category: 'Ứng dụng', accent: '#ffb35c', icon: RotateCcw, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 } },
  { type: 'DELETE_CLONE', label: 'Xóa app kép', description: 'Gỡ package khỏi XSpace', category: 'Ứng dụng', accent: '#ff9b86', icon: Trash2, defaultConfig: { packageName: 'com.garena.game.kgvn', userId: 999 } },
]

export const nodeDefinition = (type: NodeType) => NODE_CATALOG.find((item) => item.type === type) ?? NODE_CATALOG[0]
