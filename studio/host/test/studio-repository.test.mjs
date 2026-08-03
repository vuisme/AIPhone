import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../errors.mjs'
import { StudioRepository } from '../studio-repository.mjs'

const database = {
  query: async () => { throw new Error('Database must not be called for invalid workflow input') },
}

test('StudioRepository reports invalid workflow documents as structured validation errors', async () => {
  const repository = new StudioRepository(database, {})

  await assert.rejects(
    repository.createWorkflow({ id: 'owner', role: 'USER' }, { id: 'invalid', nodes: [], edges: [] }),
    (error) => error instanceof HttpError && error.status === 422 && error.code === 'VALIDATION_ERROR',
  )
})

test('StudioRepository serializes administrator changes before checking the final active admin', async () => {
  const queries = []
  const client = {
    query: async (sql) => {
      queries.push(sql)
      if (sql.startsWith('SELECT *')) return { rows: [{ id: 'admin-1', email: 'admin@example.com', display_name: 'Admin', password_hash: 'hash', role: 'ADMIN', status: 'ACTIVE' }] }
      if (sql.startsWith('SELECT count')) return { rows: [{ count: 2 }] }
      if (sql.startsWith('UPDATE')) return { rows: [{ id: 'admin-1', email: 'admin@example.com', display_name: 'Admin', password_hash: 'hash', role: 'USER', status: 'ACTIVE' }] }
      return { rows: [] }
    },
  }
  const repository = new StudioRepository({ transaction: (run) => run(client) }, {})

  await repository.updateUser('admin-1', { role: 'USER' })

  assert.equal(queries[0], 'LOCK TABLE studio_users IN SHARE ROW EXCLUSIVE MODE')
  assert.match(queries[1], /FOR UPDATE/)
})

test('StudioRepository reassigns an authenticated callback device and clears old grants', async () => {
  const queries = []
  const existing = {
    id: 'device-row',
    serial: 'cloud:known',
    label: 'Xiaomi',
    model: 'Xiaomi',
    owner_user_id: 'old-owner',
    connection_mode: 'CLOUD_CALLBACK',
    callback_device_id: 'known-device-installation',
    callback_secret_ciphertext: 'ciphertext',
    callback_secret_iv: 'iv',
    callback_secret_auth_tag: 'tag',
  }
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params })
      if (sql.startsWith('SELECT * FROM studio_devices')) return { rowCount: 1, rows: [existing] }
      if (sql.startsWith('DELETE FROM studio_device_grants')) return { rowCount: 2, rows: [] }
      if (sql.startsWith('UPDATE studio_devices')) return { rowCount: 1, rows: [{ ...existing, owner_user_id: params[1], model: params[2] }] }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const credentialCipher = {
    verifyCallbackSecret: (record, candidate, deviceId, callbackDeviceId) => (
      record.ciphertext === 'ciphertext' && candidate === 's'.repeat(43) && deviceId === 'device-row' && callbackDeviceId === 'known-device-installation'
    ),
  }
  const repository = new StudioRepository({ transaction: (run) => run(client) }, credentialCipher)

  const device = await repository.reclaimCallbackDevice(
    { id: 'new-owner', displayName: 'New Owner' },
    {
      deviceId: 'known-device-installation',
      deviceSecret: 's'.repeat(43),
      metadata: { model: 'Xiaomi 15' },
    },
  )

  assert.equal(device.id, 'device-row')
  assert.equal(device.serial, 'cloud:known')
  assert.equal(device.ownerUserId, 'new-owner')
  assert.match(queries[0].sql, /FOR UPDATE/)
  assert.match(queries[1].sql, /DELETE FROM studio_device_grants/)
})
