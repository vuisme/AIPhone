import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { CallbackHub } from '../callback-hub.mjs'
import { pairingCodeHash } from '../callback-protocol.mjs'

class FakeSocket extends EventEmitter {
  constructor() {
    super()
    this.readyState = 1
    this.messages = []
  }

  send(message, callback) {
    this.messages.push(JSON.parse(message))
    callback?.()
  }

  close() {
    this.readyState = 3
    this.emit('close')
  }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('CallbackHub claims an online device with a one-time pairing code', async () => {
  const values = new Map()
  const redis = {
    set: async (key, value) => { values.set(key, value) },
    getDel: async (key) => { const value = values.get(key); values.delete(key); return value },
    get: async (key) => values.get(key),
    incr: async (key) => { const value = Number(values.get(key) || 0) + 1; values.set(key, value); return value },
    expire: async () => undefined,
    del: async (key) => values.delete(key),
  }
  const repository = {
    authenticateCallbackDevice: async () => undefined,
    claimCallbackDevice: async (user, hello) => ({ serial: `cloud:${hello.deviceId}`, id: 'device-row', ownerDisplayName: user.displayName }),
  }
  const hub = new CallbackHub({ repository, redis, log: () => undefined })
  const socket = new FakeSocket()
  hub.acceptConnection(socket)
  socket.emit('message', Buffer.from(JSON.stringify({
    type: 'HELLO', protocolVersion: 1, deviceId: 'device-installation-1234', deviceSecret: 's'.repeat(43),
    pairingCodeHash: pairingCodeHash('ABCD-EFGH-23'), metadata: { model: 'Xiaomi' },
  })))
  await nextTurn()
  assert.equal(socket.messages[0].type, 'PAIRING_REQUIRED')

  const device = await hub.claim({ id: 'owner', displayName: 'Phone Farm Admin' }, 'abcd efgh 23')
  assert.equal(device.serial, 'cloud:device-installation-1234')
  assert.equal(socket.messages.at(-1).type, 'PAIRED')
  assert.equal(socket.messages.at(-1).accountName, 'Phone Farm Admin')
  assert.equal(hub.isOnline(device.serial), true)
  hub.close()
})

test('CallbackHub re-pairs an authenticated device without creating a duplicate', async () => {
  const values = new Map()
  const redis = {
    set: async (key, value) => { values.set(key, value) },
    getDel: async (key) => { const value = values.get(key); values.delete(key); return value },
    get: async (key) => values.get(key),
    incr: async (key) => { const value = Number(values.get(key) || 0) + 1; values.set(key, value); return value },
    expire: async () => undefined,
    del: async (key) => values.delete(key),
  }
  const calls = []
  const repository = {
    authenticateCallbackDevice: async () => ({ serial: 'cloud:known', ownerDisplayName: 'Old Owner' }),
    reclaimCallbackDevice: async (user, hello) => {
      calls.push({ user, hello })
      return { serial: 'cloud:known', id: 'device-row', ownerDisplayName: user.displayName }
    },
  }
  const hub = new CallbackHub({ repository, redis, log: () => undefined })
  const socket = new FakeSocket()
  hub.acceptConnection(socket)
  socket.emit('message', Buffer.from(JSON.stringify({
    type: 'HELLO', protocolVersion: 1, deviceId: 'known-device-installation', deviceSecret: 's'.repeat(43),
    pairingCodeHash: pairingCodeHash('JKLM-NPQR-45'), pairingRequested: true, metadata: { model: 'Xiaomi' },
  })))
  await nextTurn()

  assert.equal(socket.messages[0].type, 'PAIRING_REQUIRED')
  assert.equal(hub.isOnline('cloud:known'), false)

  const device = await hub.claim({ id: 'new-owner', displayName: 'New Owner' }, 'jklm npqr 45')
  assert.equal(device.serial, 'cloud:known')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].hello.deviceId, 'known-device-installation')
  assert.equal(socket.messages.at(-1).type, 'PAIRED')
  assert.equal(socket.messages.at(-1).accountName, 'New Owner')
  assert.equal(hub.isOnline('cloud:known'), true)
  hub.close()
})

test('CallbackHub correlates commands with binary device results', async () => {
  const repository = {
    authenticateCallbackDevice: async () => ({ serial: 'cloud:known', ownerDisplayName: 'Phone Farm Admin' }),
    markCallbackSeen: async () => undefined,
  }
  const hub = new CallbackHub({ repository, redis: {}, log: () => undefined })
  const socket = new FakeSocket()
  hub.acceptConnection(socket)
  socket.emit('message', Buffer.from(JSON.stringify({
    type: 'HELLO', protocolVersion: 1, deviceId: 'known-device-installation', deviceSecret: 's'.repeat(43),
    pairingCodeHash: 'a'.repeat(64), metadata: { model: 'Xiaomi' },
  })))
  await nextTurn()
  assert.equal(socket.messages[0].type, 'READY')
  assert.equal(socket.messages[0].accountName, 'Phone Farm Admin')

  const responsePromise = hub.request('cloud:known', { method: 'GET', path: '/api/device' })
  const command = socket.messages.at(-1)
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'RESULT', requestId: command.requestId, status: 200, contentType: 'application/json', bodyBase64: Buffer.from('{"ok":true}').toString('base64') })))
  const response = await responsePromise
  assert.equal(response.status, 200)
  assert.equal(response.body.toString(), '{"ok":true}')
  hub.close()
})
