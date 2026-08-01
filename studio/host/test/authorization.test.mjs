import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditWorkflow, canManageWorkflow, canPairDevice, canUseDevice } from '../authorization.mjs'

const admin = { id: 'admin', role: 'ADMIN' }
const owner = { id: 'owner', role: 'USER' }
const granted = { id: 'granted', role: 'USER' }
const stranger = { id: 'stranger', role: 'USER' }

test('workflow policy separates edit grants from owner-only management', () => {
  const workflow = { ownerUserId: owner.id, grantedUserIds: [granted.id] }

  assert.equal(canEditWorkflow(admin, workflow), true)
  assert.equal(canEditWorkflow(owner, workflow), true)
  assert.equal(canEditWorkflow(granted, workflow), true)
  assert.equal(canEditWorkflow(stranger, workflow), false)
  assert.equal(canManageWorkflow(granted, workflow), false)
  assert.equal(canManageWorkflow(owner, workflow), true)
})

test('device policy allows use grants but protects pairing ownership', () => {
  const device = { ownerUserId: owner.id, grantedUserIds: [granted.id] }

  assert.equal(canUseDevice(admin, device), true)
  assert.equal(canUseDevice(granted, device), true)
  assert.equal(canUseDevice(stranger, device), false)
  assert.equal(canPairDevice(granted, device), false)
  assert.equal(canPairDevice(owner, device), true)
  assert.equal(canPairDevice(stranger, undefined), true)
})
