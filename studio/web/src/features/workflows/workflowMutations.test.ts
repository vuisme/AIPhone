import { describe, expect, it } from 'vitest'
import { createStarterWorkflow, type ImageAssetRecord } from '../../contracts/workflow'
import { isAssetReferenced, removeAsset, uniqueWorkflowId, upsertAsset } from './workflowMutations'

const imageAsset = (workflowId: string, name = 'Đăng ký sau'): ImageAssetRecord => ({
  id: 'register-later',
  workflowId,
  type: 'IMAGE',
  name,
  fileName: 'register-later.png',
  threshold: 0.88,
  width: 120,
  height: 40,
  updatedAt: '2026-07-31T00:00:00.000Z',
})

describe('workflow mutations', () => {
  it('creates stable unique workflow IDs', () => {
    const existing = [createStarterWorkflow('Liên Quân', 'lien-quan'), createStarterWorkflow('Liên Quân 2', 'lien-quan-2')]
    expect(uniqueWorkflowId('Liên Quân', existing)).toBe('lien-quan-3')
  })

  it('replaces an Asset without creating duplicate IDs', () => {
    const workflow = createStarterWorkflow('Test', 'test')
    const first = upsertAsset(workflow, imageAsset('test'))
    const replaced = upsertAsset(first, imageAsset('test', 'Tên mới'))
    expect(replaced.assets).toHaveLength(1)
    expect(replaced.assets[0].name).toBe('Tên mới')
  })

  it('blocks deleting an Asset referenced by a node', () => {
    const withAsset = upsertAsset(createStarterWorkflow('Test', 'test'), imageAsset('test'))
    const workflow = {
      ...withAsset,
      nodes: [...withAsset.nodes, { id: 'tap', type: 'TAP_IMAGE' as const, position: { x: 0, y: 0 }, config: { assetId: 'register-later' } }],
    }
    expect(isAssetReferenced(workflow, 'register-later')).toBe(true)
    expect(() => removeAsset(workflow, 'register-later')).toThrow('referenced')
  })
})
