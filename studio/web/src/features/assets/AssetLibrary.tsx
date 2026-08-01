import { Image, Pencil, RefreshCw, ScanText, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { agentApi } from '../../api/client'
import type { AssetRecord, ImageAssetRecord, WorkflowDocument } from '../../contracts/workflow'

interface AssetLibraryProps {
  workflows: WorkflowDocument[]
  selectedWorkflowId: string
  onSelectWorkflow: (id: string) => void
  onCapture: (workflowId: string) => void
  onReplace: (asset: ImageAssetRecord) => void
  onRename: (asset: AssetRecord, name: string) => void
  onDelete: (asset: AssetRecord) => void
}

function ImagePreview({ asset }: { asset: ImageAssetRecord }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let active = true
    let createdUrl: string | undefined
    agentApi.getAssetImage(asset.workflowId, asset.id).then((blob) => {
      if (!active) return
      createdUrl = URL.createObjectURL(blob)
      setUrl(createdUrl)
    }).catch(() => undefined)
    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [asset.id, asset.updatedAt, asset.workflowId])
  return url ? <img src={url} alt="" /> : <Image size={24} />
}

function AssetCard({ asset, onReplace, onRename, onDelete }: Pick<AssetLibraryProps, 'onReplace' | 'onRename' | 'onDelete'> & { asset: AssetRecord }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(asset.name)
  return (
    <article className="asset-card">
      <div className={`asset-preview asset-${asset.type.toLowerCase()}`}>{asset.type === 'IMAGE' ? <ImagePreview asset={asset} /> : <ScanText size={26} />}</div>
      <div className="asset-card__copy">
        <span>{asset.type === 'IMAGE' ? 'IMAGE ASSET' : 'UI SELECTOR'}</span>
        {editing ? <div className="asset-rename"><input aria-label="Tên Asset" value={name} onChange={(event) => setName(event.target.value)} /><button onClick={() => { onRename(asset, name.trim() || asset.name); setEditing(false) }}>Lưu</button></div> : <strong>{asset.name}</strong>}
        <code>{asset.id}</code>
        {asset.type === 'IMAGE' ? <small>{asset.width} × {asset.height} · {Math.round(asset.threshold * 100)}%</small> : <small>{asset.selector.text || asset.selector.contentDescription || asset.selector.resourceId || 'Selector'}</small>}
      </div>
      <div className="asset-card__actions">
        {asset.type === 'IMAGE' && <button title="Chụp lại và thay ảnh" onClick={() => onReplace(asset)}><RefreshCw size={15} /></button>}
        <button title="Đổi tên" onClick={() => { setName(asset.name); setEditing((value) => !value) }}><Pencil size={15} /></button>
        <button title="Xóa Asset" className="danger-text" onClick={() => onDelete(asset)}><Trash2 size={15} /></button>
      </div>
    </article>
  )
}

export function AssetLibrary(props: AssetLibraryProps) {
  return (
    <section className="workspace-page asset-library" aria-labelledby="asset-library-title">
      <header className="workspace-page__header">
        <div><span>ASSET REGISTRY</span><h2 id="asset-library-title">Kho Asset theo workflow</h2><p>Ảnh và UI selector được quản lý độc lập, nhưng luôn thuộc một workflow.</p></div>
        <button className="primary-button" onClick={() => props.onCapture(props.selectedWorkflowId)}><Image size={16} /> Thêm Asset</button>
      </header>
      <nav className="asset-workflow-tabs" aria-label="Nhóm Asset theo workflow">
        {props.workflows.map((workflow) => <button key={workflow.id} className={workflow.id === props.selectedWorkflowId ? 'active' : ''} onClick={() => props.onSelectWorkflow(workflow.id)}><strong>{workflow.name}</strong><span>{workflow.assets.length}</span></button>)}
      </nav>
      {props.workflows.map((workflow) => workflow.id === props.selectedWorkflowId && (
        <div className="asset-grid" key={workflow.id}>
          {workflow.assets.length === 0 && <div className="asset-empty"><Image size={30} /><strong>Workflow này chưa có Asset</strong><span>Dùng Capture Lab để crop ảnh hoặc lấy selector text.</span></div>}
          {workflow.assets.map((asset) => <AssetCard key={asset.id} asset={asset} onReplace={props.onReplace} onRename={props.onRename} onDelete={props.onDelete} />)}
        </div>
      ))}
    </section>
  )
}
