import assert from 'node:assert/strict'
import test from 'node:test'
import { isAccountWorkflowId, scopeWorkflowDocument } from '../workflow-identity.mjs'

function workflow(id = 'default-workspace') {
  return {
    schemaVersion: 2,
    id,
    name: 'Default Workspace',
    revision: 1,
    nodes: [],
    edges: [],
    assets: [{ id: 'button', workflowId: id, type: 'IMAGE' }],
  }
}

test('account workflow identity keeps the display name while separating backend IDs', () => {
  const first = scopeWorkflowDocument('owner-a', workflow())
  const second = scopeWorkflowDocument('owner-b', workflow())

  assert.equal(first.name, 'Default Workspace')
  assert.equal(first.id, 'user-owner-a-default-workspace')
  assert.equal(second.id, 'user-owner-b-default-workspace')
  assert.equal(first.assets[0].workflowId, first.id)
  assert.notEqual(first.id, second.id)
})

test('account workflow identity recognizes only the authenticated account namespace', () => {
  assert.equal(isAccountWorkflowId('owner-a', 'user-owner-a-rewards'), true)
  assert.equal(isAccountWorkflowId('owner-b', 'user-owner-a-rewards'), false)
})

test('account workflow identity repairs Asset ownership on an already scoped document', () => {
  const scoped = scopeWorkflowDocument('owner-a', workflow('user-owner-a-rewards'))

  assert.equal(scoped.assets[0].workflowId, 'user-owner-a-rewards')
})
