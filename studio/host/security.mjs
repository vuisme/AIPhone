import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT_COST = 32_768
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const PASSWORD_BYTES = 64
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('Email is invalid')
  const email = value.trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) throw new Error('Email is invalid')
  return email
}

export function assertPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new Error('Password must contain 12 to 128 characters')
  }
  return value
}

export async function hashPassword(password) {
  assertPassword(password)
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, PASSWORD_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  })
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64'),
    Buffer.from(derived).toString('base64'),
  ].join('$')
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, cost, blockSize, parallelization, saltBase64, hashBase64] = String(encoded).split('$')
    if (algorithm !== 'scrypt') return false
    const expected = Buffer.from(hashBase64, 'base64')
    if (expected.length !== PASSWORD_BYTES) return false
    const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltBase64, 'base64'), expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    }))
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function credentialAad(deviceId, serial) {
  return Buffer.from(`aiphone-device-credential\0${deviceId}\0${serial}`, 'utf8')
}

function callbackAad(deviceId, callbackDeviceId) {
  return Buffer.from(`aiphone-callback-secret\0${deviceId}\0${callbackDeviceId}`, 'utf8')
}

function encryptValue(key, value, aad) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

function decryptValue(key, record, aad) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'))
  decipher.setAAD(aad)
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export class CredentialCipher {
  constructor(key) {
    this.key = Buffer.from(key)
    if (this.key.length !== 32) throw new Error('Credential encryption key must be exactly 32 bytes')
  }

  encrypt(token, deviceId, serial) {
    const normalized = String(token).replace(/\s/g, '')
    if (normalized.length < 16 || normalized.length > 512) throw new Error('Pairing token is invalid')
    return encryptValue(this.key, normalized, credentialAad(deviceId, serial))
  }

  decrypt(record, deviceId, serial) {
    return decryptValue(this.key, record, credentialAad(deviceId, serial))
  }

  encryptCallbackSecret(secret, deviceId, callbackDeviceId) {
    const normalized = String(secret)
    if (!/^[a-zA-Z0-9_-]{32,128}$/.test(normalized)) throw new Error('Callback device secret is invalid')
    return encryptValue(this.key, normalized, callbackAad(deviceId, callbackDeviceId))
  }

  verifyCallbackSecret(record, candidate, deviceId, callbackDeviceId) {
    try {
      const expected = Buffer.from(decryptValue(this.key, record, callbackAad(deviceId, callbackDeviceId)))
      const actual = Buffer.from(String(candidate))
      return expected.length === actual.length && timingSafeEqual(expected, actual)
    } catch {
      return false
    }
  }
}
