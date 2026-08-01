import { createHash } from 'node:crypto'
import { validation } from './errors.mjs'

export const CALLBACK_PROTOCOL_VERSION = 1
export const CALLBACK_MAX_BODY_BYTES = 16 * 1024 * 1024
export const CALLBACK_MAX_MESSAGE_BYTES = 24 * 1024 * 1024
export const CALLBACK_PAIRING_SECONDS = 10 * 60

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{15,100}$/
const SECRET_PATTERN = /^[a-zA-Z0-9_-]{32,128}$/
const PAIRING_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/

function boundedString(value, label, maximum, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined
    throw validation(`${label} is required`)
  }
  if (typeof value !== 'string' || value.length > maximum) throw validation(`${label} is invalid`)
  return value
}

export function normalizePairingCode(value) {
  const code = String(value || '').toUpperCase().replace(/[\s-]/g, '')
  if (!PAIRING_CODE_PATTERN.test(code)) throw validation('Callback pairing code is invalid')
  return code
}

export function pairingCodeHash(value) {
  return createHash('sha256').update(normalizePairingCode(value)).digest('hex')
}

export function validateCallbackHello(input) {
  if (!input || input.type !== 'HELLO' || input.protocolVersion !== CALLBACK_PROTOCOL_VERSION) {
    throw validation('Callback protocol version is unsupported')
  }
  const deviceId = boundedString(input.deviceId, 'Callback device ID', 101)
  const deviceSecret = boundedString(input.deviceSecret, 'Callback device secret', 128)
  const codeHash = boundedString(input.pairingCodeHash, 'Callback pairing code hash', 64)
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw validation('Callback device ID is invalid')
  if (!SECRET_PATTERN.test(deviceSecret)) throw validation('Callback device secret is invalid')
  if (!/^[a-f0-9]{64}$/.test(codeHash)) throw validation('Callback pairing code hash is invalid')
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}
  return {
    deviceId,
    deviceSecret,
    pairingCodeHash: codeHash,
    metadata: {
      model: boundedString(metadata.model, 'Device model', 120, { required: false }) || 'Android device',
      androidVersion: boundedString(metadata.androidVersion, 'Android version', 40, { required: false }),
      agentVersion: boundedString(metadata.agentVersion, 'Agent version', 80, { required: false }),
    },
  }
}

export function decodeCallbackBody(value) {
  if (value === undefined || value === '') return Buffer.alloc(0)
  if (typeof value !== 'string' || value.length > Math.ceil(CALLBACK_MAX_BODY_BYTES * 4 / 3) + 4) throw validation('Callback body is too large')
  const body = Buffer.from(value, 'base64')
  if (body.length > CALLBACK_MAX_BODY_BYTES) throw validation('Callback body is too large')
  return body
}

export function validateCallbackResult(input) {
  if (!input || input.type !== 'RESULT' || typeof input.requestId !== 'string' || input.requestId.length > 100) {
    throw validation('Callback result is invalid')
  }
  const status = Number(input.status)
  if (!Number.isInteger(status) || status < 100 || status > 599) throw validation('Callback result status is invalid')
  return {
    requestId: input.requestId,
    status,
    contentType: boundedString(input.contentType, 'Callback content type', 160, { required: false }) || 'application/octet-stream',
    body: decodeCallbackBody(input.bodyBase64),
  }
}
