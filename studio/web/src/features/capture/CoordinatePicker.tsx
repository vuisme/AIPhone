import { Check, Crosshair, MoveDiagonal2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Point, Size } from './crop'
import { displayPointToNative, type GestureMode, type GestureSelection } from './coordinates'

interface CoordinatePickerProps {
  imageUrl: string
  nativeSize: Size
  mode: GestureMode
  initialSelection?: GestureSelection
  onApply: (selection: GestureSelection) => void
}

function markerPosition(point: Point, nativeSize: Size) {
  return {
    left: `${point.x / Math.max(1, nativeSize.width - 1) * 100}%`,
    top: `${point.y / Math.max(1, nativeSize.height - 1) * 100}%`,
  }
}

export function CoordinatePicker({ imageUrl, nativeSize, mode, initialSelection, onApply }: CoordinatePickerProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [selection, setSelection] = useState<GestureSelection | undefined>(initialSelection)
  const [dragging, setDragging] = useState(false)

  const pointFromPointer = (event: React.PointerEvent<HTMLImageElement>): Point => {
    const bounds = imageRef.current!.getBoundingClientRect()
    return displayPointToNative(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      { width: bounds.width, height: bounds.height },
      nativeSize,
    )
  }

  const begin = (event: React.PointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = pointFromPointer(event)
    setSelection(mode === 'TAP' ? { start } : { start, end: start })
    setDragging(mode === 'SWIPE')
  }

  const move = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragging || mode !== 'SWIPE') return
    const end = pointFromPointer(event)
    setSelection((current) => current ? { ...current, end } : current)
  }

  const finish = (event: React.PointerEvent<HTMLImageElement>) => {
    if (dragging && mode === 'SWIPE') {
      const end = pointFromPointer(event)
      setSelection((current) => current ? { ...current, end } : current)
    }
    setDragging(false)
  }

  const hasSwipePath = mode === 'TAP' || Boolean(selection?.end && (selection.start.x !== selection.end.x || selection.start.y !== selection.end.y))

  return (
    <div className="capture-mode-grid coordinate-picker">
      <div className="capture-stage">
        <div className="capture-image-wrap coordinate-image-wrap">
          <img
            ref={imageRef}
            src={imageUrl}
            alt={mode === 'TAP' ? 'Chọn điểm chạm trên màn hình điện thoại' : 'Kéo hướng vuốt trên màn hình điện thoại'}
            draggable={false}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => setDragging(false)}
          />
          {selection && <div className="coordinate-marker start" style={markerPosition(selection.start, nativeSize)}><span>1</span></div>}
          {mode === 'SWIPE' && selection?.end && <>
            <svg className="gesture-path" viewBox={`0 0 ${nativeSize.width} ${nativeSize.height}`} preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id="gesture-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>
              <line x1={selection.start.x} y1={selection.start.y} x2={selection.end.x} y2={selection.end.y} markerEnd="url(#gesture-arrow)" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="coordinate-marker end" style={markerPosition(selection.end, nativeSize)}><span>2</span></div>
          </>}
        </div>
      </div>
      <aside className="capture-settings">
        <div className="capture-stat"><span>DEVICE SCREEN</span><strong>{nativeSize.width} × {nativeSize.height}</strong></div>
        <div className="gesture-instruction">
          {mode === 'TAP' ? <Crosshair size={20} /> : <MoveDiagonal2 size={20} />}
          <div><strong>{mode === 'TAP' ? 'Chọn điểm chạm' : 'Kéo hướng vuốt'}</strong><p>{mode === 'TAP' ? 'Bấm trực tiếp vào vị trí cần thao tác.' : 'Kéo từ điểm bắt đầu đến điểm kết thúc.'}</p></div>
        </div>
        <div className="selection-readout"><span>{mode === 'TAP' ? 'TỌA ĐỘ CLICK' : 'ĐIỂM BẮT ĐẦU'}</span><strong>{selection ? `X ${selection.start.x} · Y ${selection.start.y}` : 'Chưa chọn'}</strong></div>
        {mode === 'SWIPE' && <div className="selection-readout"><span>ĐIỂM KẾT THÚC</span><strong>{selection?.end ? `X ${selection.end.x} · Y ${selection.end.y}` : 'Chưa chọn'}</strong></div>}
        <button className="primary-button" type="button" disabled={!selection || !hasSwipePath} onClick={() => selection && onApply(selection)}><Check size={17} /> {mode === 'TAP' ? 'Áp dụng tọa độ' : 'Áp dụng hướng vuốt'}</button>
      </aside>
    </div>
  )
}
