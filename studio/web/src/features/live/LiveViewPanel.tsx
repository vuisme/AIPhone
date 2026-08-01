import { Crosshair, Pause, Play, RefreshCw, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { bridgeApi } from '../../api/client'
import { mapScreenPoint } from './screenCoordinates'

interface LiveViewPanelProps {
  serial: string
  onClose: () => void
}

export function LiveViewPanel({ serial, onClose }: LiveViewPanelProps) {
  const [imageUrl, setImageUrl] = useState<string>()
  const imageUrlRef = useRef<string | undefined>(undefined)
  const [nativeSize, setNativeSize] = useState({ width: 1, height: 1 })
  const [isPlaying, setPlaying] = useState(true)
  const [fps, setFps] = useState(1)
  const [error, setError] = useState<string>()
  const capturing = useRef(false)
  const mounted = useRef(true)

  const captureFrame = useCallback(async () => {
    if (capturing.current) return
    capturing.current = true
    try {
      const blob = await bridgeApi.captureScreen(serial)
      const nextUrl = URL.createObjectURL(blob)
      if (!mounted.current) {
        URL.revokeObjectURL(nextUrl)
        return
      }
      const previous = imageUrlRef.current
      imageUrlRef.current = nextUrl
      setImageUrl(nextUrl)
      setError(undefined)
      if (previous) URL.revokeObjectURL(previous)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lấy màn hình qua USB')
    } finally {
      capturing.current = false
    }
  }, [serial])

  useEffect(() => {
    void captureFrame()
    if (!isPlaying) return
    const timer = window.setInterval(() => void captureFrame(), 1000 / fps)
    return () => window.clearInterval(timer)
  }, [captureFrame, fps, isPlaying])

  useEffect(() => () => {
    mounted.current = false
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  const tap = async (event: React.MouseEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const point = mapScreenPoint(event, image.getBoundingClientRect(), nativeSize)
    try {
      await bridgeApi.tapDevice(point.x, point.y, serial)
      window.setTimeout(() => void captureFrame(), 180)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể bấm màn hình')
    }
  }

  return (
    <div className="modal-backdrop live-view-backdrop">
      <section className="live-view-panel" role="dialog" aria-modal="true" aria-labelledby="live-view-title">
        <header>
          <div><span>USB SCREEN / ROOTLESS</span><h2 id="live-view-title">Live View</h2><small>{serial}</small></div>
          <div className="live-view-actions">
            <label>FPS <select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value="1">1</option><option value="2">2</option></select></label>
            <button className="secondary-button" onClick={() => setPlaying((value) => !value)}>{isPlaying ? <Pause size={15} /> : <Play size={15} />} {isPlaying ? 'Đóng băng' : 'Tiếp tục'}</button>
            <button className="icon-button" onClick={() => void captureFrame()} aria-label="Lấy khung hình mới"><RefreshCw size={17} /></button>
            <button className="icon-button" onClick={onClose} aria-label="Đóng Live View"><X size={18} /></button>
          </div>
        </header>
        <div className="live-view-stage">
          {imageUrl ? <div className="live-view-screen"><img src={imageUrl} alt={`Màn hình ${serial}`} onLoad={(event) => setNativeSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onClick={(event) => void tap(event)} /><div className="live-view-crosshair"><Crosshair size={14} /> Bấm trực tiếp để tap</div></div> : <div className="live-view-empty"><Smartphone size={38} /><strong>Đang lấy màn hình USB...</strong></div>}
          {error && <div className="live-view-error">{error}</div>}
        </div>
        <footer><span>{nativeSize.width} × {nativeSize.height}</span><span>{isPlaying ? `LIVE · ${fps} FPS` : 'FROZEN'}</span><span>ADB screencap · không cần root</span></footer>
      </section>
    </div>
  )
}
