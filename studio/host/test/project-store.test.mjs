import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ProjectStore, sha256 } from '../project-store.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function workflow(id = 'fleet-test') {
  return {
    schemaVersion: 2,
    id,
    name: 'Fleet test',
    revision: 1,
    nodes: [],
    edges: [],
    assets: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

test('ProjectStore persists workflows independently of a phone', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiphone-store-'))
  const store = new ProjectStore(root)
  await store.createWorkflow(Buffer.from(JSON.stringify(workflow())))

  assert.deepEqual(await store.readWorkflow('fleet-test'), workflow())
  assert.equal((await store.listWorkflows())[0].id, 'fleet-test')
})

test('ProjectStore accepts an already parsed workflow object during legacy migration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiphone-store-'))
  const store = new ProjectStore(root)
  await store.createWorkflow(workflow('object-import'))

  assert.equal((await store.readWorkflow('object-import')).id, 'object-import')
})

test('ProjectStore computes the trusted PNG SHA-256', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiphone-store-'))
  const store = new ProjectStore(root)
  await store.createWorkflow(Buffer.from(JSON.stringify(workflow())))

  const record = await store.saveImageAsset('fleet-test', {
    record: { id: 'reward', workflowId: 'fleet-test', type: 'IMAGE', name: 'Reward', sha256: 'untrusted' },
    imageBase64: `data:image/png;base64,${PNG.toString('base64')}`,
  })

  assert.equal(record.sha256, sha256(PNG))
  assert.deepEqual(await readFile(path.join(root, 'assets', 'fleet-test', 'reward.png')), PNG)
})

test('ProjectStore rejects invalid IDs and non-PNG Asset bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiphone-store-'))
  const store = new ProjectStore(root)
  await store.createWorkflow(Buffer.from(JSON.stringify(workflow())))

  await assert.rejects(() => store.readWorkflow('../escape'), /invalid/)
  await assert.rejects(() => store.saveImageAsset('fleet-test', {
    record: { id: 'bad', workflowId: 'fleet-test', type: 'IMAGE' },
    imageBase64: Buffer.from('not png').toString('base64'),
  }), /PNG/)
})
