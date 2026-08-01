import { describe, expect, it, vi } from 'vitest'
import { createStarterWorkflow, type ImageAssetRecord } from '../../contracts/workflow'
import { deployWorkflow, planWorkflowDeployment } from './deployment'

const image: ImageAssetRecord = {
  id: 'reward', workflowId: 'fleet', type: 'IMAGE', name: 'Reward', fileName: 'reward.png', sha256: 'abc',
  threshold: 0.88, width: 10, height: 10, updatedAt: '2026-08-01T00:00:00.000Z',
}

function workflow() {
  return { ...createStarterWorkflow('Fleet', 'fleet'), revision: 4, assets: [image] }
}

describe('fleet deployment', () => {
  it('uploads only missing or changed image hashes', () => {
    expect(planWorkflowDeployment(workflow(), { workflowId: 'fleet', exists: true, revision: 4, assets: [{ id: 'reward', sha256: 'abc' }] })).toEqual({ assetIds: [], saveWorkflow: false })
    expect(planWorkflowDeployment(workflow(), { workflowId: 'fleet', exists: true, revision: 4, assets: [{ id: 'reward', sha256: 'old' }] })).toEqual({ assetIds: ['reward'], saveWorkflow: true })
  })

  it('uploads Assets before saving and starting the workflow', async () => {
    const calls: string[] = []
    const dependencies = {
      getInventory: vi.fn(async () => ({ workflowId: 'fleet', exists: false, revision: 0, assets: [] })),
      readAsset: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
      uploadAsset: vi.fn(async (upload) => { calls.push(`asset:${upload.record.id}`); return upload.record }),
      saveWorkflow: vi.fn(async (value) => { calls.push('workflow'); return value }),
      startRun: vi.fn(async () => { calls.push('run'); return { id: 'run', state: 'RUNNING' as const, iteration: 0 } }),
    }

    const result = await deployWorkflow(workflow(), 'phone-1', dependencies, true)

    expect(calls).toEqual(['asset:reward', 'workflow', 'run'])
    expect(result.uploadedAssetIds).toEqual(['reward'])
  })
})

