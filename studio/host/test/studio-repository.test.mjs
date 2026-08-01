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
