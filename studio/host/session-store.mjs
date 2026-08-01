import { createHash, randomBytes } from 'node:crypto'
import { createClient } from 'redis'
import { HttpError } from './errors.mjs'

const SESSION_SECONDS = 7 * 24 * 60 * 60
const LOGIN_WINDOW_SECONDS = 15 * 60
const MAX_LOGIN_FAILURES = 5

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function connectRedis(url = process.env.REDIS_URL) {
  if (!url) throw new Error('REDIS_URL is required')
  const client = createClient({ url })
  client.on('error', (error) => {
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'redis_error', message: error.message })}\n`)
  })
  await client.connect()
  return client
}

export class RedisSessionStore {
  constructor(client) {
    this.client = client
  }

  sessionKey(token) {
    return `session:${sha256(token)}`
  }

  userSessionsKey(userId) {
    return `user-sessions:${userId}`
  }

  loginKey(email, ip) {
    return `login-limit:${sha256(`${email}\0${ip}`)}`
  }

  async create(userId) {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const tokenHash = sha256(token)
    const session = { userId, csrfToken, createdAt: new Date().toISOString() }
    const transaction = this.client.multi()
    transaction.set(`session:${tokenHash}`, JSON.stringify(session), { EX: SESSION_SECONDS })
    transaction.sAdd(this.userSessionsKey(userId), tokenHash)
    transaction.expire(this.userSessionsKey(userId), SESSION_SECONDS)
    await transaction.exec()
    return { token, csrfToken, userId }
  }

  async get(token) {
    const value = await this.client.get(this.sessionKey(token))
    return value ? JSON.parse(value) : undefined
  }

  async revoke(token) {
    const key = this.sessionKey(token)
    const value = await this.client.get(key)
    if (value) {
      const session = JSON.parse(value)
      await this.client.multi().del(key).sRem(this.userSessionsKey(session.userId), sha256(token)).exec()
    }
  }

  async revokeUser(userId) {
    const setKey = this.userSessionsKey(userId)
    const hashes = await this.client.sMembers(setKey)
    const keys = hashes.map((hash) => `session:${hash}`)
    if (keys.length > 0) await this.client.del(keys)
    await this.client.del(setKey)
  }

  async assertLoginAllowed(email, ip) {
    const failures = Number(await this.client.get(this.loginKey(email, ip)) || 0)
    if (failures >= MAX_LOGIN_FAILURES) {
      throw new HttpError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts. Try again later.')
    }
  }

  async recordLoginFailure(email, ip) {
    const key = this.loginKey(email, ip)
    const failures = await this.client.incr(key)
    if (failures === 1) await this.client.expire(key, LOGIN_WINDOW_SECONDS)
  }

  async clearLoginFailures(email, ip) {
    await this.client.del(this.loginKey(email, ip))
  }
}
