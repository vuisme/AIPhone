import { Image, LoaderCircle, RefreshCw, ScanText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AssetUpload, CapturePreview, NormalizedRect, UiHierarchySnapshot } from '../../api/client'
import type { ImageAssetRecord, UiSelectorAssetRecord } from '../../contracts/workflow'
import type { Size } from './crop'
import { ImageAssetEditor } from './ImageAssetEditor'
import { UiInspectorEditor } from './UiInspectorEditor'
import { acquireCaptureSource, type CaptureSource } from './captureSource'

interface CaptureLabProps {
  workflowId: string
  capture: () => Promise<Blob>
  capturePreview: () => Promise<CapturePreview>
  cropCapture: (captureId: string, rect: NormalizedRect) => Promise<Blob>
  inspect: () => Promise<UiHierarchySnapshot>
  initialImageAsset?: ImageAssetRecord
  onClose: () => void
  onSaveImage: (upload: AssetUpload) => Promise<void>
  onSaveSelector: (asset: UiSelectorAssetRecord, createNode: boolean) => Promise<void>
}

export function CaptureLab(props: CaptureLabProps) {
  const [mode, setMode] = useState<'IMAGE' | 'TEXT'>('IMAGE')
  const [imageUrl, setImageUrl] = useState<string>()
  const [nativeSize, setNativeSize] = useState<Size>()
  const [hierarchy, setHierarchy] = useState<UiHierarchySnapshot>()
  const [captureSource, setCaptureSource] = useState<CaptureSource>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()
  const imageUrlRef = useRef<string | undefined>(undefined)

  const replaceImageUrl = (source: CaptureSource) => {
    const nextUrl = URL.createObjectURL(source.preview)
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    imageUrlRef.current = nextUrl
    setCaptureSource(source)
    setNativeSize(source.mode === 'SESSION' ? source.sourceSize : undefined)
    setImageUrl(nextUrl)
  }

  const refresh = async (nextMode = mode) => {
    setIsLoading(true)
    setError(undefined)
    try {
      const [source, hierarchyResult] = await Promise.all([
        acquireCaptureSource(props.capturePreview, props.capture),
        nextMode === 'TEXT' ? props.inspect() : Promise.resolve(undefined),
      ])
      replaceImageUrl(source)
      setHierarchy(hierarchyResult)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lấy dữ liệu từ điện thoại')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh('IMAGE')
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    }
    // Capture once when the lab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeMode = (nextMode: 'IMAGE' | 'TEXT') => {
    setMode(nextMode)
    if (nextMode === 'TEXT' && !hierarchy) void refresh(nextMode)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="capture-modal capture-lab" role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <header><div><span>CAPTURE LAB</span><h2 id="capture-title">Asset ảnh & UI Inspector</h2></div><div className="capture-header-actions"><button className="secondary-button" onClick={() => void refresh()} disabled={isLoading}><RefreshCw size={15} className={isLoading ? 'spin' : ''} /> Làm mới</button><button className="icon-button" onClick={props.onClose} aria-label="Đóng"><X /></button></div></header>
        <nav className="capture-mode-tabs" aria-label="Chế độ Capture Lab"><button className={mode === 'IMAGE' ? 'active' : ''} onClick={() => changeMode('IMAGE')}><Image size={16} /> Crop Asset ảnh</button><button className={mode === 'TEXT' ? 'active' : ''} onClick={() => changeMode('TEXT')}><ScanText size={16} /> Inspector text / XML</button></nav>
        <div className="capture-body capture-lab__body">
          {isLoading && <div className="capture-loading"><LoaderCircle className="spin" /><span>Đang lấy dữ liệu trực tiếp từ điện thoại...</span></div>}
          {error && !isLoading && <div className="capture-empty"><strong>Không thể mở Capture Lab</strong><p>{error}</p><button className="secondary-button" onClick={() => void refresh()}>Thử lại</button></div>}
          {imageUrl && nativeSize && !isLoading && mode === 'IMAGE' && <ImageAssetEditor key={imageUrl} workflowId={props.workflowId} imageUrl={imageUrl} nativeSize={nativeSize} initialAsset={props.initialImageAsset} crop={captureSource?.mode === 'SESSION' ? (rect) => props.cropCapture(captureSource.captureId, rect) : undefined} onSave={props.onSaveImage} />}
          {imageUrl && nativeSize && hierarchy && !isLoading && mode === 'TEXT' && <UiInspectorEditor key={hierarchy.capturedAt} workflowId={props.workflowId} imageUrl={imageUrl} nativeSize={nativeSize} hierarchy={hierarchy} onSave={props.onSaveSelector} />}
          {imageUrl && <img className="capture-size-probe" src={imageUrl} alt="" onLoad={(event) => setNativeSize((current) => current ?? { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />}
        </div>
      </section>
    </div>
  )
}
