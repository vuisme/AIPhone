import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthService } from '../auth-service.mjs'
import { hashPassword } from '../security.mjs'

function fakeDependencies(initialUsers = []) {
  const users = [...initialUsers]
  const activeSessions = new Map()
  const revokedUsers = []
  const accounts = {
    hasUsers: async () => users.length > 0,
    createInitialAdmin: async (input) => {
      if (users.length > 0) throw Object.assign(new Error('Setup is already complete'), { code: 'SETUP_COMPLETE' })
      const user = { id: 'admin-id', role: 'ADMIN', status: 'ACTIVE', ...input }
      users.push(user)
      return user
    },
    findUserByEmail: async (email) => users.find((user) => user.email === email),
    findUserById: async (id) => users.find((user) => user.id === id),
    recordAudit: async () => undefined,
  }
  const sessions = {
    assertLoginAllowed: async () => undefined,
    recordLoginFailure: async () => undefined,
    clearLoginFailures: async () => undefined,
    create: async (userId) => {
      const session = { token: `token-${userId}`, csrfToken: `csrf-${userId}`, userId }
      activeSessions.set(session.token, session)
      return session
    },
    get: async (token) => activeSessions.get(token),
    revoke: async (token) => activeSessions.delete(token),
    revokeUser: async (userId) => { revokedUsers.push(userId) },
  }
  return { accounts, sessions, users, revokedUsers }
}

test('first-run setup creates one administrator and returns a server session', async () => {
  const dependencies = fakeDependencies()
  const service = new AuthService(dependencies)

  assert.deepEqual(await service.setupStatus(), { setupRequired: true })
  const result = await service.setup({ email: 'Admin@Example.com', displayName: 'Owner', password: 'Very secure password 123!' })

  assert.equal(result.user.email, 'admin@example.com')
  assert.equal(result.user.role, 'ADMIN')
  assert.equal(result.session.token, 'token-admin-id')
  await assert.rejects(() => service.setup({ email: 'two@example.com', displayName: 'Two', password: 'Very secure password 123!' }), /setup/i)
})

test('login rejects disabled accounts and never creates a session', async () => {
  const passwordHash = await hashPassword('Very secure password 123!')
  const dependencies = fakeDependencies([{ id: 'disabled', email: 'user@example.com', displayName: 'User', role: 'USER', status: 'DISABLED', passwordHash }])
  const service = new AuthService(dependencies)

  await assert.rejects(() => service.login({ email: 'user@example.com', password: 'Very secure password 123!', ip: '127.0.0.1' }), /invalid email or password/i)
  assert.equal(await dependencies.sessions.get('token-disabled'), undefined)
})

test('authentication rechecks account status instead of trusting Redis alone', async () => {
  const passwordHash = await hashPassword('Very secure password 123!')
  const user = { id: 'member', email: 'member@example.com', displayName: 'Member', role: 'USER', status: 'ACTIVE', passwordHash }
  const dependencies = fakeDependencies([user])
  const service = new AuthService(dependencies)
  const login = await service.login({ email: user.email, password: 'Very secure password 123!', ip: '127.0.0.1' })

  assert.equal((await service.authenticate(login.session.token)).user.id, user.id)
  user.status = 'DISABLED'
  await assert.rejects(() => service.authenticate(login.session.token), /session/i)
})
