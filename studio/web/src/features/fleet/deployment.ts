import type { AssetUpload, RunStatus, WorkflowInventory } from '../../api/client'
import type { ImageAssetRecord, WorkflowDocument } from '../../contracts/workflow'

export interface DeploymentPlan {
  assetIds: string[]
  saveWorkflow: boolean
}

export interface DeploymentDependencies {
  getInventory: (workflowId: string, serial: string) => Promise<WorkflowInventory>
  readAsset: (workflowId: string, assetId: string) => Promise<Blob>
  uploadAsset: (upload: AssetUpload, serial: string) => Promise<ImageAssetRecord>
  saveWorkflow: (workflow: WorkflowDocument, serial: string) => Promise<WorkflowDocument>
  startRun: (workflowId: string, serial: string) => Promise<RunStatus>
}

export function planWorkflowDeployment(workflow: WorkflowDocument, inventory: WorkflowInventory): DeploymentPlan {
  const remoteHashes = new Map(inventory.assets.map((asset) => [asset.id, asset.sha256]))
  const assetIds = workflow.assets
    .filter((asset): asset is ImageAssetRecord => asset.type === 'IMAGE')
    .filter((asset) => !asset.sha256 || remoteHashes.get(asset.id) !== asset.sha256)
    .map((asset) => asset.id)
  return {
    assetIds,
    saveWorkflow: !inventory.exists || inventory.revision !== workflow.revision || assetIds.length > 0,
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`
}

export async function deployWorkflow(
  workflow: WorkflowDocument,
  serial: string,
  dependencies: DeploymentDependencies,
  startAfterDeploy = false,
): Promise<{ uploadedAssetIds: string[]; run?: RunStatus }> {
  const inventory = await dependencies.getInventory(workflow.id, serial)
  const plan = planWorkflowDeployment(workflow, inventory)
  const images = new Map(workflow.assets.filter((asset): asset is ImageAssetRecord => asset.type === 'IMAGE').map((asset) => [asset.id, asset]))

  for (const assetId of plan.assetIds) {
    const record = images.get(assetId)
    if (!record) throw new Error(`Image Asset ${assetId} is missing from workflow`)
    const image = await dependencies.readAsset(workflow.id, assetId)
    await dependencies.uploadAsset({ record, imageBase64: await blobToDataUrl(image) }, serial)
  }
  if (plan.saveWorkflow) await dependencies.saveWorkflow(workflow, serial)
  const run = startAfterDeploy ? await dependencies.startRun(workflow.id, serial) : undefined
  return { uploadedAssetIds: plan.assetIds, run }
}

