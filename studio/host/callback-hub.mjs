import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { conflict, HttpError, validation } from './errors.mjs'
import {
  CALLBACK_MAX_BODY_BYTES,
  CALLBACK_MAX_MESSAGE_BYTES,
  CALLBACK_PAIRING_SECONDS,
  pairingCodeHash,
  validateCallbackHello,
  validateCallbackResult,
} from './callback-protocol.mjs'

const CALLBACK_PATH = '/callback/v1/connect'
const REQUEST_TIMEOUT_MS = 25_000
const HELLO_TIMEOUT_MS = 10_000
const MAX_CONNECTIONS = 500
const MAX_PAIRING_ATTEMPTS = 10

function pairingKey(hash) {
  return `callback-pair:${hash}`
}

function pairingAttemptsKey(userId) {
  return `callback-pair-attempts:${userId}`
}

function parseMessage(data) {
  try {
    return JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data))
  } catch {
    throw validation('Callback message must be valid JSON')
  }
}

function closeSocket(socket, code, reason) {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(code, reason.slice(0, 120))
}

function callbackLog(level, event, fields = {}) {
  const line = `${JSON.stringify({ level, event, ...fields })}\n`
  if (level === 'error' || level === 'warn') process.stderr.write(line)
  else process.stdout.write(line)
}

export class CallbackHub {
  constructor({ repository, redis, log = callbackLog }) {
    this.repository = repository
    this.redis = redis
    this.log = log
    this.connections = new Set()
    this.pendingByDeviceId = new Map()
    this.onlineBySerial = new Map()
    this.webSocketServer = new WebSocketServer({ noServer: true, maxPayload: CALLBACK_MAX_MESSAGE_BYTES, perMessageDeflate: false })
  }

  attach(server) {
    server.on('upgrade', (request, socket, head) => {
      let pathname
      try { pathname = new URL(request.url, 'http://127.0.0.1').pathname } catch { socket.destroy(); return }
      if (pathname !== CALLBACK_PATH) { socket.destroy(); return }
      if (this.connections.size >= MAX_CONNECTIONS) { socket.destroy(); return }
      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => this.acceptConnection(webSocket))
    })
  }

  acceptConnection(socket) {
    const connection = { socket, requests: new Map(), hello: undefined, serial: undefined, pairingTimer: undefined, repairingSerial: undefined }
    this.connections.add(connection)
    const helloTimer = setTimeout(() => closeSocket(socket, 1008, 'HELLO required'), HELLO_TIMEOUT_MS)
    helloTimer.unref?.()
    socket.on('message', (data) => { void this.onMessage(connection, data, helloTimer) })
    socket.on('close', () => this.removeConnection(connection))
    socket.on('error', () => this.removeConnection(connection))
    return connection
  }

  async onMessage(connection, data, helloTimer) {
    try {
      const message = parseMessage(data)
      if (!connection.hello) {
        clearTimeout(helloTimer)
        await this.acceptHello(connection, message)
        return
      }
      if (!connection.serial) throw validation('Device pairing is not complete')
      if (message.type === 'RESULT') this.acceptResult(connection, message)
      else if (message.type === 'PING') connection.socket.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }))
      else throw validation('Callback message type is unsupported')
    } catch (error) {
      closeSocket(connection.socket, 1008, error instanceof Error ? error.message : 'Invalid callback message')
    }
  }

  async acceptHello(connection, input) {
    const hello = validateCallbackHello(input)
    connection.hello = hello
    const existing = await this.repository.authenticateCallbackDevice(hello.deviceId, hello.deviceSecret)
    if (existing && !hello.pairingRequested) {
      this.promote(connection, existing.serial)
      await this.repository.markCallbackSeen(existing.serial, hello.metadata)
      this.log('info', 'callback_device_connected', { serial: existing.serial, model: hello.metadata.model })
      connection.socket.send(JSON.stringify({ type: 'READY', serial: existing.serial, accountName: existing.ownerDisplayName }))
      return
    }
    if (existing) {
      connection.repairingSerial = existing.serial
      const online = this.onlineBySerial.get(existing.serial)
      if (online && online !== connection) closeSocket(online.socket, 1000, 'Device requested a new pairing session')
    }
    await this.beginPairing(connection, hello)
  }

  async beginPairing(connection, hello) {
    const previous = this.pendingByDeviceId.get(hello.deviceId)
    if (previous && previous !== connection) closeSocket(previous.socket, 1000, 'Replaced by a newer connection')
    this.pendingByDeviceId.set(hello.deviceId, connection)
    await this.redis.set(pairingKey(hello.pairingCodeHash), hello.deviceId, { EX: CALLBACK_PAIRING_SECONDS })
    this.log('info', 'callback_pairing_waiting', { deviceId: hello.deviceId, model: hello.metadata.model, expiresInSeconds: CALLBACK_PAIRING_SECONDS })
    connection.socket.send(JSON.stringify({ type: 'PAIRING_REQUIRED', expiresInSeconds: CALLBACK_PAIRING_SECONDS }))
    connection.pairingTimer = setTimeout(() => {
      if (connection.serial || connection.socket.readyState !== WebSocket.OPEN) return
      connection.socket.send(JSON.stringify({ type: 'PAIRING_EXPIRED' }))
      closeSocket(connection.socket, 4000, 'Pairing code expired')
    }, CALLBACK_PAIRING_SECONDS * 1000)
    connection.pairingTimer.unref?.()
  }

  promote(connection, serial) {
    const previous = this.onlineBySerial.get(serial)
    if (previous && previous !== connection) closeSocket(previous.socket, 1000, 'Replaced by a newer connection')
    connection.serial = serial
    clearTimeout(connection.pairingTimer)
    connection.pairingTimer = undefined
    this.onlineBySerial.set(serial, connection)
    if (connection.hello) {
      this.pendingByDeviceId.delete(connection.hello.deviceId)
      delete connection.hello.deviceSecret
      delete connection.hello.pairingCodeHash
      delete connection.hello.pairingRequested
    }
  }

  async claim(user, rawCode) {
    const attemptsKey = pairingAttemptsKey(user.id)
    const attempts = Number(await this.redis.get(attemptsKey) || 0)
    if (attempts >= MAX_PAIRING_ATTEMPTS) throw new HttpError(429, 'PAIRING_RATE_LIMITED', 'Too many callback pairing attempts. Try again later.')
    const hash = pairingCodeHash(rawCode)
    const deviceId = await this.redis.getDel(pairingKey(hash))
    if (!deviceId) {
      const failures = await this.redis.incr(attemptsKey)
      if (failures === 1) await this.redis.expire(attemptsKey, CALLBACK_PAIRING_SECONDS)
      throw new HttpError(404, 'PAIRING_CODE_NOT_FOUND', 'Callback pairing code is invalid or expired')
    }
    const connection = this.pendingByDeviceId.get(deviceId)
    if (!connection || connection.hello?.pairingCodeHash !== hash || connection.socket.readyState !== WebSocket.OPEN) {
      throw conflict('CALLBACK_OFFLINE', 'The callback device disconnected before pairing completed')
    }
    const device = connection.repairingSerial
      ? await this.repository.reclaimCallbackDevice(user, connection.hello)
      : await this.repository.claimCallbackDevice(user, connection.hello)
    await this.redis.del(attemptsKey)
    this.promote(connection, device.serial)
    this.log('info', 'callback_device_paired', { serial: device.serial, ownerUserId: user.id })
    connection.socket.send(JSON.stringify({ type: 'PAIRED', serial: device.serial, accountName: device.ownerDisplayName || user.displayName }))
    return device
  }

  listOnlineDevices() {
    return [...this.onlineBySerial.entries()].map(([serial, connection]) => ({
      serial,
      state: connection.socket.readyState === WebSocket.OPEN ? 'device' : 'offline',
      model: connection.hello?.metadata.model || null,
      product: 'cloud-callback',
      transportId: connection.hello?.deviceId || null,
      connectionMode: 'CLOUD_CALLBACK',
    }))
  }

  isOnline(serial) {
    return this.onlineBySerial.get(serial)?.socket.readyState === WebSocket.OPEN
  }

  async request(serial, { method, path, headers = {}, body = Buffer.alloc(0) }) {
    const connection = this.onlineBySerial.get(serial)
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) throw new HttpError(404, 'DEVICE_NOT_CONNECTED', 'Callback device is offline')
    const requestBody = Buffer.isBuffer(body) ? body : Buffer.from(body)
    if (requestBody.length > CALLBACK_MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'Callback request body is too large')
    if (connection.requests.size >= 16) throw new HttpError(429, 'DEVICE_BUSY', 'Callback device has too many pending commands')
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.requests.delete(requestId)
        this.log('warn', 'callback_command_timeout', { requestId, serial, method, path: path.split('?', 1)[0] })
        reject(new HttpError(504, 'CALLBACK_TIMEOUT', 'Callback device did not respond in time'))
      }, REQUEST_TIMEOUT_MS)
      timer.unref?.()
      connection.requests.set(requestId, { resolve, reject, timer })
      connection.socket.send(JSON.stringify({
        type: 'COMMAND',
        requestId,
        method,
        path,
        headers: Object.fromEntries(Object.entries(headers).filter(([, value]) => typeof value === 'string')),
        bodyBase64: requestBody.length ? requestBody.toString('base64') : '',
      }), (error) => {
        if (!error) return
        clearTimeout(timer)
        connection.requests.delete(requestId)
        reject(new HttpError(502, 'CALLBACK_SEND_FAILED', 'Unable to send command to callback device'))
      })
    })
  }

  acceptResult(connection, input) {
    const result = validateCallbackResult(input)
    const pending = connection.requests.get(result.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    connection.requests.delete(result.requestId)
    pending.resolve(result)
  }

  removeConnection(connection) {
    if (!this.connections.delete(connection)) return
    clearTimeout(connection.pairingTimer)
    if (connection.hello && this.pendingByDeviceId.get(connection.hello.deviceId) === connection) this.pendingByDeviceId.delete(connection.hello.deviceId)
    if (connection.serial && this.onlineBySerial.get(connection.serial) === connection) this.onlineBySerial.delete(connection.serial)
    if (connection.hello) this.log('info', 'callback_device_disconnected', { serial: connection.serial, deviceId: connection.hello.deviceId, pendingCommands: connection.requests.size })
    for (const pending of connection.requests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new HttpError(502, 'CALLBACK_DISCONNECTED', 'Callback device disconnected'))
    }
    connection.requests.clear()
  }

  close() {
    for (const connection of this.connections) closeSocket(connection.socket, 1001, 'Studio shutting down')
    this.webSocketServer.close()
  }
}
