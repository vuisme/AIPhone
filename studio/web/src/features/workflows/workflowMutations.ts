import type { AssetRecord, WorkflowDocument } from '../../contracts/workflow'
import { accountScope } from '../../lib/accountScope'
import { slugifyId } from '../../lib/ids'

export function uniqueWorkflowId(name: string, workflows: WorkflowDocument[], accountId?: string): string {
  const prefix = accountId ? `${accountScope(accountId)}-` : ''
  let suffix = 2
  const candidate = (postfix = '') => `${prefix}${slugifyId(name, 'workflow', 101 - prefix.length - postfix.length)}${postfix}`
  let id = candidate()
  while (workflows.some((workflow) => workflow.id === id)) id = candidate(`-${suffix++}`)
  return id
}

export function remapWorkflowId(workflow: WorkflowDocument, id: string): WorkflowDocument {
  return {
    ...workflow,
    id,
    assets: workflow.assets.map((asset) => ({ ...asset, workflowId: id })),
  }
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
