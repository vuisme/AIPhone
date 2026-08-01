import type { AssetRecord, WorkflowDocument } from '../../contracts/workflow'
import { slugifyId } from '../../lib/ids'

export function uniqueWorkflowId(name: string, workflows: WorkflowDocument[]): string {
  const slug = slugifyId(name, 'workflow')
  let id = slug
  let suffix = 2
  while (workflows.some((workflow) => workflow.id === id)) id = `${slug}-${suffix++}`
  return id
}

export function upsertAsset(workflow: WorkflowDocument, asset: AssetRecord): WorkflowDocument {
  if (asset.workflowId !== workflow.id) throw new Error('Asset belongs to another workflow')
  return {
    ...workflow,
    assets: [...workflow.assets.filter((item) => item.id !== asset.id), asset],
    revision: workflow.revision + 1,
    updatedAt: new Date().toISOString(),
  }
}

export function isAssetReferenced(workflow: WorkflowDocument, assetId: string): boolean {
  return workflow.nodes.some((node) => node.config.assetId === assetId)
}

export function removeAsset(workflow: WorkflowDocument, assetId: string): WorkflowDocument {
  if (isAssetReferenced(workflow, assetId)) throw new Error('Asset is still referenced by a node')
  return {
    ...workflow,
    assets: workflow.assets.filter((item) => item.id !== assetId),
    revision: workflow.revision + 1,
    updatedAt: new Date().toISOString(),
  }
}
