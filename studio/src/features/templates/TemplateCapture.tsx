import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Crosshair, LoaderCircle, RefreshCw, X } from 'lucide-react'
import type { TemplateRecord } from '../../contracts/workflow'
import type { TemplateUpload } from '../../api/client'
import { clampSelection, displayToNativeRect, type Point, type Rect, type Size } from './crop'

interface TemplateCaptureProps {
  capture: () => Promise<Blob>
  onClose: () => void
  onSave: (upload: TemplateUpload) => Promise<void>
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

export function TemplateCapture({ capture, onClose, onSave }: TemplateCaptureProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState<string>()
  const [nativeSize, setNativeSize] = useState<Size>()
  const [start, setStart] = useState<Point>()
  const [selection, setSelection] = useState<Rect>()
  const [name, setName] = useState('Quà mong muốn')
  const [threshold, setThreshold] = useState(0.88)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>()

  const takeScreenshot = async () => {
    setIsLoading(true)
    setError(undefined)
    try {
      const blob = await capture()
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      setImageUrl(URL.createObjectURL(blob))
      setSelection(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể chụp màn hình')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void takeScreenshot()
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }
    // Capture once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointer = (event: React.PointerEvent): Point => {
    const rect = imageRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const save = async () => {
    const image = imageRef.current
    if (!image || !selection || !nativeSize || selection.width < 2 || selection.height < 2) return
    setIsSaving(true)
    setError(undefined)
    try {
      const displaySize = { width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }
      const nativeRect = displayToNativeRect(selection, displaySize, nativeSize)
      const canvas = document.createElement('canvas')
      canvas.width = nativeRect.width
      canvas.height = nativeRect.height
      const context = canvas.getContext('2d', { alpha: false })!
      context.drawImage(image, nativeRect.x, nativeRect.y, nativeRect.width, nativeRect.height, 0, 0, nativeRect.width, nativeRect.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Crop thất bại')), 'image/png'))
      const id = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'template'}-${Date.now().toString(36)}`
      const record: TemplateRecord = {
        id,
        name: name.trim() || 'Template mới',
        fileName: `${id}.png`,
        threshold,
        width: nativeRect.width,
        height: nativeRect.height,
        updatedAt: new Date().toISOString(),
      }
      await onSave({ record, imageBase64: await blobToDataUrl(blob) })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu template')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <header>
          <div><span>TEMPLATE LAB</span><h2 id="capture-title">Chụp và crop chính xác</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button>
        </header>
        <div className="capture-body">
          <div className="capture-stage">
            {isLoading && <div className="capture-loading"><LoaderCircle className="spin" /><span>Đang lấy khung hình từ điện thoại...</span></div>}
            {imageUrl && (
              <div className="capture-image-wrap">
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Màn hình điện thoại"
                  draggable={false}
                  onLoad={(event) => setNativeSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointer(event); setStart(point); setSelection({ ...point, width: 0, height: 0 }) }}
                  onPointerMove={(event) => { if (!start) return; const image = imageRef.current!; setSelection(clampSelection(start, pointer(event), { width: image.clientWidth, height: image.clientHeight })) }}
                  onPointerUp={() => setStart(undefined)}
                />
                {selection && <div className="crop-selection" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}><span><Crosshair size={14} /> {Math.round(selection.width)} × {Math.round(selection.height)}</span></div>}
              </div>
            )}
            {!imageUrl && !isLoading && <div className="capture-empty"><Camera size={34} /><p>Chưa có ảnh màn hình.</p></div>}
          </div>
          <aside className="capture-settings">
            <div className="capture-stat"><span>SCREEN</span><strong>{nativeSize ? `${nativeSize.width} × ${nativeSize.height}` : '—'}</strong></div>
            <label>Tên template<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Ngưỡng nhận dạng<div className="range-row"><input type="range" min="0.5" max="1" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><output>{Math.round(threshold * 100)}%</output></div></label>
            <div className="selection-readout">
              <span>Vùng crop hiển thị</span>
              <strong>{selection ? `${Math.round(selection.x)}, ${Math.round(selection.y)} · ${Math.round(selection.width)} × ${Math.round(selection.height)}` : 'Kéo trên ảnh để chọn'}</strong>
            </div>
            {error && <div className="inline-error">{error}</div>}
            <button className="secondary-button" onClick={() => void takeScreenshot()} disabled={isLoading}><RefreshCw size={16} /> Chụp lại</button>
            <button className="primary-button" onClick={() => void save()} disabled={!selection || isSaving}>{isSaving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Lưu template</button>
          </aside>
        </div>
      </div>
    </div>
  )
}
