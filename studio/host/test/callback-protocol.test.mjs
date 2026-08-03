import assert from 'node:assert/strict'
import test from 'node:test'
import { pairingCodeHash, normalizePairingCode, validateCallbackHello, validateCallbackResult } from '../callback-protocol.mjs'

test('callback pairing codes normalize visual separators before hashing', () => {
  assert.equal(normalizePairingCode('abcd-efgh-23'), 'ABCDEFGH23')
  assert.equal(pairingCodeHash('ABCD EFGH 23'), pairingCodeHash('abcd-efgh-23'))
  assert.throws(() => normalizePairingCode('short'))
})

test('callback HELLO accepts only bounded protocol credentials and metadata', () => {
  const input = {
    type: 'HELLO',
    protocolVersion: 1,
    deviceId: 'device-installation-1234',
    deviceSecret: 'a'.repeat(43),
    pairingCodeHash: 'b'.repeat(64),
    pairingRequested: true,
    metadata: { model: 'Xiaomi', androidVersion: '16', agentVersion: '0.3' },
  }
  const hello = validateCallbackHello(input)
  assert.equal(hello.metadata.model, 'Xiaomi')
  assert.equal(hello.pairingRequested, true)
  assert.equal(validateCallbackHello({ ...input, pairingRequested: undefined }).pairingRequested, false)
  assert.throws(() => validateCallbackHello({ ...input, pairingRequested: 'true' }))
  assert.throws(() => validateCallbackHello({ ...input, protocolVersion: 2 }))
})

test('callback RESULT decodes binary bodies with a bounded status', () => {
  const result = validateCallbackResult({ type: 'RESULT', requestId: 'request-1', status: 200, contentType: 'image/png', bodyBase64: Buffer.from('png').toString('base64') })
  assert.equal(result.body.toString(), 'png')
  assert.throws(() => validateCallbackResult({ type: 'RESULT', requestId: 'request-1', status: 999 }))
})
