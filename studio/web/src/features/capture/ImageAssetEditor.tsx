import { Check, Crosshair } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AssetUpload } from '../../api/client'
import type { ImageAssetRecord } from '../../contracts/workflow'
import { slugifyId } from '../../lib/ids'
import { clampSelection, displayToNativeRect, displayToNormalizedRect, type NormalizedRect, type Point, type Rect, type Size } from './crop'

interface ImageAssetEditorProps {
  workflowId: string
  imageUrl: string
  nativeSize: Size
  initialAsset?: ImageAssetRecord
  crop?: (rect: NormalizedRect) => Promise<Blob>
  onSave: (upload: AssetUpload) => Promise<void>
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

function assetId(name: string): string {
  return `${slugifyId(name, 'asset')}-${Date.now().toString(36)}`
}

export function ImageAssetEditor({ workflowId, imageUrl, nativeSize, initialAsset, crop, onSave }: ImageAssetEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [start, setStart] = useState<Point>()
  const [selection, setSelection] = useState<Rect>()
  const [name, setName] = useState(initialAsset?.name ?? 'Quà mong muốn')
  const [threshold, setThreshold] = useState(initialAsset?.threshold ?? 0.88)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>()

  const pointer = (event: React.PointerEvent): Point => {
    const rect = imageRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const save = async () => {
    const image = imageRef.current
    if (!image || !selection || selection.width < 2 || selection.height < 2) return
    setIsSaving(true)
    setError(undefined)
    try {
      const displaySize = { width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }
      const nativeRect = displayToNativeRect(selection, displaySize, nativeSize)
      const blob = crop
        ? await crop(displayToNormalizedRect(selection, displaySize))
        : await cropInBrowser(image, nativeRect)
      const id = initialAsset?.id ?? assetId(name)
      const record: ImageAssetRecord = {
        id,
        workflowId,
        type: 'IMAGE',
        name: name.trim() || 'Asset ảnh',
        fileName: `${id}.png`,
        threshold,
        width: nativeRect.width,
        height: nativeRect.height,
        updatedAt: new Date().toISOString(),
      }
      await onSave({ record, imageBase64: await blobToDataUrl(blob) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu Asset')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="capture-mode-grid">
      <div className="capture-stage"><div className="capture-image-wrap"><img ref={imageRef} src={imageUrl} alt="Màn hình điện thoại" draggable={false} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointer(event); setStart(point); setSelection({ ...point, width: 0, height: 0 }) }} onPointerMove={(event) => { if (!start) return; const image = imageRef.current!; setSelection(clampSelection(start, pointer(event), { width: image.clientWidth, height: image.clientHeight })) }} onPointerUp={() => setStart(undefined)} />{selection && <div className="crop-selection" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}><span><Crosshair size={14} /> {Math.round(selection.width)} × {Math.round(selection.height)}</span></div>}</div></div>
      <aside className="capture-settings">
        <div className="capture-stat"><span>SCREEN</span><strong>{nativeSize.width} × {nativeSize.height}</strong></div>
        <label>Tên Asset<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Ngưỡng nhận dạng<div className="range-row"><input type="range" min="0.5" max="1" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><output>{Math.round(threshold * 100)}%</output></div></label>
        <div className="selection-readout"><span>Vùng crop hiển thị</span><strong>{selection ? `${Math.round(selection.x)}, ${Math.round(selection.y)} · ${Math.round(selection.width)} × ${Math.round(selection.height)}` : 'Kéo trên ảnh để chọn'}</strong></div>
        {error && <div className="inline-error">{error}</div>}
        <button className="primary-button" onClick={() => void save()} disabled={!selection || isSaving}><Check size={17} /> {initialAsset ? 'Thay ảnh Asset' : 'Lưu Asset ảnh'}</button>
      </aside>
    </div>
  )
}

async function cropInBrowser(image: HTMLImageElement, nativeRect: Rect): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = nativeRect.width
  canvas.height = nativeRect.height
  canvas.getContext('2d', { alpha: false })!.drawImage(image, nativeRect.x, nativeRect.y, nativeRect.width, nativeRect.height, 0, 0, nativeRect.width, nativeRect.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Crop thất bại')), 'image/png'))
}
