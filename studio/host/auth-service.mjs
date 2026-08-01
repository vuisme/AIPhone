import { randomBytes } from 'node:crypto'
import { conflict, forbidden, HttpError, unauthorized, validation } from './errors.mjs'
import { hashPassword, normalizeEmail, verifyPassword } from './security.mjs'

function publicUser(user) {
  if (!user) return undefined
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export class AuthService {
  constructor({ accounts, sessions }) {
    this.accounts = accounts
    this.sessions = sessions
    this.dummyPasswordHash = hashPassword(randomBytes(24).toString('base64url'))
  }

  async setupStatus() {
    return { setupRequired: !(await this.accounts.hasUsers()) }
  }

  async setup({ email, displayName, password }) {
    if (await this.accounts.hasUsers()) throw conflict('SETUP_COMPLETE', 'Setup is already complete')
    let normalizedEmail
    try { normalizedEmail = normalizeEmail(email) } catch (error) { throw validation(error.message) }
    const normalizedName = String(displayName || '').trim()
    if (normalizedName.length < 2 || normalizedName.length > 80) throw validation('Display name must contain 2 to 80 characters')
    let passwordHash
    try { passwordHash = await hashPassword(password) } catch (error) { throw validation(error.message) }
    const user = await this.accounts.createInitialAdmin({
      email: normalizedEmail,
      displayName: normalizedName,
      passwordHash,
    })
    const session = await this.sessions.create(user.id)
    await this.accounts.recordAudit?.({ actorUserId: user.id, action: 'INITIAL_ADMIN_CREATED', targetType: 'USER', targetId: user.id })
    return { user: publicUser(user), session }
  }

  async login({ email, password, ip = 'unknown' }) {
    let normalizedEmail
    try { normalizedEmail = normalizeEmail(email) } catch { throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password') }
    await this.sessions.assertLoginAllowed(normalizedEmail, ip)
    const user = await this.accounts.findUserByEmail(normalizedEmail)
    const validPassword = await verifyPassword(password, user?.passwordHash || await this.dummyPasswordHash)
    if (!user || user.status !== 'ACTIVE' || !validPassword) {
      await this.sessions.recordLoginFailure(normalizedEmail, ip)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    }
    await this.sessions.clearLoginFailures(normalizedEmail, ip)
    const session = await this.sessions.create(user.id)
    await this.accounts.recordAudit?.({ actorUserId: user.id, action: 'LOGIN_SUCCEEDED', targetType: 'USER', targetId: user.id })
    return { user: publicUser(user), session }
  }

  async authenticate(token) {
    if (!token) throw unauthorized()
    const session = await this.sessions.get(token)
    if (!session) throw unauthorized('Authentication session has expired')
    const user = await this.accounts.findUserById(session.userId)
    if (!user || user.status !== 'ACTIVE') {
      await this.sessions.revoke(token)
      throw unauthorized('Authentication session is no longer valid')
    }
    return { user: publicUser(user), session, token }
  }

  assertCsrf(authentication, csrfToken) {
    const expected = authentication?.session?.csrfToken
    if (!expected || typeof csrfToken !== 'string' || csrfToken !== expected) {
      throw forbidden('CSRF token is invalid')
    }
  }

  async logout(token) {
    if (token) await this.sessions.revoke(token)
  }
}

export { publicUser }
