import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AdbBridge, DisabledAdbBridge } from './adb.mjs'
import { forbidden, HttpError, unauthorized } from './errors.mjs'
import { ProjectStore } from './project-store.mjs'
import { createRuntimeServices } from './runtime-services.mjs'
import { hashPassword } from './security.mjs'
import { publicUser } from './auth-service.mjs'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const studioDirectory = path.resolve(moduleDirectory, '..', 'web', 'dist')
const BRIDGE_ORIGINS = new Set(['http://127.0.0.1:4173', 'http://localhost:4173'])
const SESSION_COOKIE = 'aiphone.sid'
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://127.0.0.1:4174 http://localhost:4174; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}
const API_PATHS = [
  /^\/api\/device$/,
  /^\/api\/capabilities\/tts$/,
  /^\/api\/screenshots$/,
  /^\/api\/input\/tap$/,
  /^\/api\/ui-hierarchy$/,
  /^\/api\/workflows$/,
  /^\/api\/workflows\/default$/,
  /^\/api\/workflows\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/,
  /^\/api\/workflows\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\/inventory$/,
  /^\/api\/workflows\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\/assets\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/,
  /^\/api\/templates\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/,
  /^\/api\/runs$/,
  /^\/api\/runs\/current$/,
  /^\/api\/runs\/current\/stop$/,
  /^\/api\/runs\/audio\/[0-9a-f-]{36}$/,
  /^\/api\/node-tests$/,
]
const STUDIO_WORKFLOW_PATH = /^\/studio\/workflows\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})$/
const STUDIO_ASSET_PATH = /^\/studio\/workflows\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})\/assets\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})$/
const STUDIO_CREDENTIAL_PATH = /^\/studio\/devices\/([^/]+)\/credential$/
const ADMIN_USER_PATH = /^\/admin\/users\/([^/]+)$/
const ADMIN_RESET_PASSWORD_PATH = /^\/admin\/users\/([^/]+)\/reset-password$/
const ADMIN_WORKFLOW_GRANTS_PATH = /^\/admin\/workflows\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})\/grants(?:\/([^/]+))?$/
const ADMIN_DEVICE_GRANTS_PATH = /^\/admin\/devices\/([^/]+)\/grants(?:\/([^/]+))?$/
const BRIDGE_SCREEN_PATH = /^\/bridge\/devices\/([^/]+)\/screen$/
const BRIDGE_TAP_PATH = /^\/bridge\/devices\/([^/]+)\/input\/tap$/
const MAX_STUDIO_BODY_BYTES = 12 * 1024 * 1024

export function agentPathFromBridgeUrl(rawUrl, serial) {
  const prefix = `/bridge/devices/${encodeURIComponent(serial)}`
  if (!rawUrl.startsWith(`${prefix}/`)) throw new Error('Invalid agent path')
  const target = rawUrl.slice(prefix.length)
  const pathname = target.split('?', 1)[0]
  const suspicious = /(?:\.\.|%2e|%5c|\\|\/\/)/i.test(pathname)
  if (suspicious || !API_PATHS.some((pattern) => pattern.test(pathname))) throw new Error('Invalid agent path')
  return target
}

function json(response, status, body, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  })
  response.end(data)
}

function bytes(response, status, contentType, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  })
  response.end(body)
}

function errorBody(error, requestId, structured) {
  const internalMessage = error instanceof Error ? error.message : 'Invalid request'
  if (!structured) return { error: internalMessage }
  return {
    error: {
      code: error instanceof HttpError ? error.code : 'REQUEST_FAILED',
      message: error instanceof HttpError ? internalMessage : 'The request could not be completed',
      ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
    },
    requestId,
  }
}

async function requestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_STUDIO_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function requestJson(request) {
  const bytes = await requestBody(request)
  try {
    return JSON.parse(bytes.toString('utf8') || '{}')
  } catch {
    throw new HttpError(422, 'INVALID_JSON', 'Request body must be valid JSON')
  }
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=')
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
  }))
}

function sessionCookie(token, maxAge) {
  const secure = process.env.AIPHONE_COOKIE_SECURE === '1' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
}

export function bridgeCorsHeaders(origin) {
  if (!origin) return {}
  if (!BRIDGE_ORIGINS.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Cache-Control, Pragma',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

async function serveStudio(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  const relative = requestPath === '/' ? 'index.html' : requestPath.slice(1)
  if (relative.includes('..') || relative.includes('\\')) return json(response, 400, { error: 'Invalid path' })
  let target = path.resolve(studioDirectory, relative)
  if (!target.startsWith(`${studioDirectory}${path.sep}`) && target !== studioDirectory) return json(response, 400, { error: 'Invalid path' })
  try {
    if (!(await stat(target)).isFile()) throw new Error('Not a file')
  } catch {
    target = path.join(studioDirectory, 'index.html')
  }
  const extension = path.extname(target).toLowerCase()
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  }[extension] || 'application/octet-stream'
  response.writeHead(200, { 'Content-Type': contentType, ...SECURITY_HEADERS })
  createReadStream(target).pipe(response)
}

function proxyToAgent(request, response, port, targetPath, onError, responseHeaders = {}, agentHeaders = {}) {
  const headers = { ...request.headers }
  for (const name of ['host', 'connection', 'cookie', 'origin', 'x-csrf-token', 'x-aiphone-token']) delete headers[name]
  Object.assign(headers, agentHeaders, { host: `127.0.0.1:${port}`, connection: 'close' })
  const proxy = http.request({ hostname: '127.0.0.1', port, path: targetPath, method: request.method, headers }, (agentResponse) => {
    response.writeHead(agentResponse.statusCode || 502, {
      ...agentResponse.headers,
      'cache-control': 'no-store',
      ...([401, 403].includes(agentResponse.statusCode || 0) ? { 'x-aiphone-pairing-rejected': '1' } : {}),
      ...SECURITY_HEADERS,
      ...responseHeaders,
    })
    agentResponse.pipe(response)
  })
  proxy.setTimeout(20_000, () => proxy.destroy(new Error('Agent request timed out')))
  proxy.on('error', (error) => {
    onError?.()
    if (response.headersSent) response.destroy(error)
    else json(response, 502, { error: { code: 'AGENT_UNAVAILABLE', message: error.message } }, responseHeaders)
  })
  request.pipe(proxy)
}

function assertAdmin(authentication) {
  if (authentication.user.role !== 'ADMIN') throw forbidden('Administrator access is required')
}

function requireCsrf(services, authentication, request) {
  services.auth.assertCsrf(authentication, request.headers['x-csrf-token'])
}

function safeDevice(device) {
  const { credential: _credential, ...safe } = device
  return safe
}

function offlineBridgeDevice(device, user) {
  const canPair = device.connectionMode === 'USB' && (user.role === 'ADMIN' || device.ownerUserId === user.id)
  return {
    serial: device.serial,
    state: 'offline',
    model: device.model || null,
    product: null,
    transportId: null,
    claimed: true,
    authorized: true,
    paired: device.connectionMode === 'CLOUD_CALLBACK' || device.hasCredential === true,
    canPair,
    deviceId: device.id,
    connectionMode: device.connectionMode,
    ownerUserId: device.ownerUserId,
    ownerDisplayName: device.ownerDisplayName,
    label: device.label,
  }
}

export function createStudioServer({
  bridge = new AdbBridge(),
  projectStore = new ProjectStore(),
  services,
  bridgeOnly = false,
  staticOnly = false,
} = {}) {
  const server = http.createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID()
    let responseHeaders = { 'X-Request-Id': requestId }
    const structuredErrors = Boolean(services)
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const corsHeaders = bridgeOnly ? bridgeCorsHeaders(request.headers.origin) : {}
      if (corsHeaders === null) return json(response, 403, errorBody(forbidden('Origin is not allowed'), requestId, structuredErrors), responseHeaders)
      responseHeaders = { ...responseHeaders, ...corsHeaders }
      const localApi = ['/auth/', '/admin/', '/bridge/', '/studio/'].some((prefix) => url.pathname.startsWith(prefix))
      if (bridgeOnly && request.method === 'OPTIONS' && localApi) {
        response.writeHead(204, responseHeaders)
        return response.end()
      }
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json(response, 200, { status: 'ok', mode: staticOnly ? 'static' : bridgeOnly ? 'bridge' : 'full', identity: services ? 'enabled' : staticOnly ? 'delegated' : 'legacy' }, responseHeaders)
      }
      if (staticOnly && localApi) return json(response, 404, { error: 'Studio data and USB bridge run on the host' }, responseHeaders)

      const authenticate = async () => {
        if (!services) return undefined
        return services.auth.authenticate(cookies(request)[SESSION_COOKIE])
      }

      if (services && request.method === 'GET' && url.pathname === '/auth/setup-status') {
        return json(response, 200, await services.auth.setupStatus(), responseHeaders)
      }
      if (services && request.method === 'POST' && url.pathname === '/auth/setup') {
        const result = await services.auth.setup(await requestJson(request))
        const imported = await services.importLegacy(result.user)
        process.stdout.write(`${JSON.stringify({ level: 'info', event: 'initial_admin_created', requestId, userId: result.user.id, legacyImported: imported.imported })}\n`)
        return json(response, 201, { user: result.user, csrfToken: result.session.csrfToken, legacyImported: imported.imported }, {
          ...responseHeaders,
          'Set-Cookie': sessionCookie(result.session.token, 7 * 24 * 60 * 60),
        })
      }
      if (services && request.method === 'POST' && url.pathname === '/auth/login') {
        const payload = await requestJson(request)
        const result = await services.auth.login({ ...payload, ip: request.socket.remoteAddress || 'unknown' })
        process.stdout.write(`${JSON.stringify({ level: 'info', event: 'login_succeeded', requestId, userId: result.user.id })}\n`)
        return json(response, 200, { user: result.user, csrfToken: result.session.csrfToken }, {
          ...responseHeaders,
          'Set-Cookie': sessionCookie(result.session.token, 7 * 24 * 60 * 60),
        })
      }
      if (services && request.method === 'GET' && url.pathname === '/auth/session') {
        const authentication = await authenticate()
        return json(response, 200, { user: authentication.user, csrfToken: authentication.session.csrfToken }, responseHeaders)
      }
      if (services && request.method === 'POST' && url.pathname === '/auth/logout') {
        const authentication = await authenticate()
        requireCsrf(services, authentication, request)
        await services.auth.logout(authentication.token)
        return bytes(response, 204, 'text/plain', Buffer.alloc(0), { ...responseHeaders, 'Set-Cookie': sessionCookie('', 0) })
      }

      const authentication = services && localApi ? await authenticate() : undefined

      if (services && request.method === 'GET' && url.pathname === '/admin/users') {
        assertAdmin(authentication)
        return json(response, 200, { users: (await services.repository.listUsers()).map(publicUser) }, responseHeaders)
      }
      if (services && request.method === 'POST' && url.pathname === '/admin/users') {
        assertAdmin(authentication)
        requireCsrf(services, authentication, request)
        const payload = await requestJson(request)
        const user = await services.repository.createUser({
          actorUserId: authentication.user.id,
          email: payload.email,
          displayName: payload.displayName,
          passwordHash: await hashPassword(payload.password),
          role: payload.role || 'USER',
        })
        await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'USER_CREATED', targetType: 'USER', targetId: user.id, metadata: { role: user.role } })
        return json(response, 201, publicUser(user), responseHeaders)
      }
      const resetPasswordMatch = ADMIN_RESET_PASSWORD_PATH.exec(url.pathname)
      if (services && resetPasswordMatch && request.method === 'POST') {
        assertAdmin(authentication)
        requireCsrf(services, authentication, request)
        const payload = await requestJson(request)
        const userId = decodeURIComponent(resetPasswordMatch[1])
        const user = await services.repository.resetUserPassword(userId, await hashPassword(payload.password))
        await services.sessions.revokeUser(userId)
        await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'USER_PASSWORD_RESET', targetType: 'USER', targetId: userId })
        return json(response, 200, publicUser(user), responseHeaders)
      }
      const adminUserMatch = ADMIN_USER_PATH.exec(url.pathname)
      if (services && adminUserMatch && request.method === 'PATCH') {
        assertAdmin(authentication)
        requireCsrf(services, authentication, request)
        const userId = decodeURIComponent(adminUserMatch[1])
        const user = await services.repository.updateUser(userId, await requestJson(request))
        if (user.status === 'DISABLED') await services.sessions.revokeUser(userId)
        await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'USER_UPDATED', targetType: 'USER', targetId: userId, metadata: { role: user.role, status: user.status } })
        return json(response, 200, publicUser(user), responseHeaders)
      }
      const workflowGrants = ADMIN_WORKFLOW_GRANTS_PATH.exec(url.pathname)
      if (services && workflowGrants) {
        assertAdmin(authentication)
        const workflowId = workflowGrants[1]
        const userId = workflowGrants[2] ? decodeURIComponent(workflowGrants[2]) : undefined
        if (request.method === 'GET' && !userId) return json(response, 200, { grants: await services.repository.listWorkflowGrants(workflowId) }, responseHeaders)
        requireCsrf(services, authentication, request)
        if (request.method === 'PUT' && userId) {
          await services.repository.grantWorkflow(authentication.user.id, workflowId, userId)
          await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'WORKFLOW_GRANTED', targetType: 'WORKFLOW', targetId: workflowId, metadata: { userId } })
          return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
        }
        if (request.method === 'DELETE' && userId) {
          await services.repository.revokeWorkflowGrant(workflowId, userId)
          return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
        }
      }
      const deviceGrants = ADMIN_DEVICE_GRANTS_PATH.exec(url.pathname)
      if (services && deviceGrants) {
        assertAdmin(authentication)
        const deviceId = decodeURIComponent(deviceGrants[1])
        const userId = deviceGrants[2] ? decodeURIComponent(deviceGrants[2]) : undefined
        if (request.method === 'GET' && !userId) return json(response, 200, { grants: await services.repository.listDeviceGrants(deviceId) }, responseHeaders)
        requireCsrf(services, authentication, request)
        if (request.method === 'PUT' && userId) {
          await services.repository.grantDevice(authentication.user.id, deviceId, userId)
          await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'DEVICE_GRANTED', targetType: 'DEVICE', targetId: deviceId, metadata: { userId } })
          return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
        }
        if (request.method === 'DELETE' && userId) {
          await services.repository.revokeDeviceGrant(deviceId, userId)
          return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
        }
      }
      if (services && url.pathname.startsWith('/admin/')) throw new HttpError(404, 'NOT_FOUND', 'Unknown administration resource')

      const credentialMatch = STUDIO_CREDENTIAL_PATH.exec(url.pathname)
      if (services && credentialMatch) {
        const serial = decodeURIComponent(credentialMatch[1])
        if (request.method === 'GET') {
          const status = await services.repository.connectedDeviceStatus(authentication.user, serial)
          if (status.claimed && status.authorized === false) throw forbidden('This account cannot access the selected device')
          return json(response, 200, status, responseHeaders)
        }
        requireCsrf(services, authentication, request)
        if (request.method === 'PUT') {
          const connected = (await bridge.listDevices()).find((device) => device.serial === serial && device.state === 'device')
          if (!connected) throw new HttpError(404, 'DEVICE_NOT_CONNECTED', 'ADB device is not connected')
          const payload = await requestJson(request)
          const device = await services.repository.saveDeviceCredential(authentication.user, {
            serial,
            model: connected.model,
            label: payload.label,
            token: payload.token,
          })
          await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'DEVICE_PAIRED', targetType: 'DEVICE', targetId: device.id, metadata: { serial } })
          return json(response, 200, { ...safeDevice(device), paired: true }, responseHeaders)
        }
        if (request.method === 'DELETE') {
          await services.repository.forgetDeviceCredential(authentication.user, serial)
          await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'DEVICE_CREDENTIAL_FORGOTTEN', targetType: 'DEVICE', targetId: serial })
          return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
        }
      }
      if (services && request.method === 'GET' && url.pathname === '/studio/devices') {
        return json(response, 200, { devices: await services.repository.listDevices(authentication.user) }, responseHeaders)
      }
      if (services && request.method === 'POST' && url.pathname === '/studio/callback-pairings') {
        requireCsrf(services, authentication, request)
        const device = await services.callbackHub.claim(authentication.user, (await requestJson(request)).code)
        await services.repository.recordAudit({ actorUserId: authentication.user.id, action: 'CALLBACK_DEVICE_PAIRED', targetType: 'DEVICE', targetId: device.id, metadata: { serial: device.serial } })
        return json(response, 201, safeDevice(device), responseHeaders)
      }

      const studioWorkflow = STUDIO_WORKFLOW_PATH.exec(url.pathname)
      const studioAsset = STUDIO_ASSET_PATH.exec(url.pathname)
      const store = services?.repository || projectStore
      const storeArgs = services && localApi ? [authentication.user] : []
      if (request.method === 'GET' && url.pathname === '/studio/workflows') {
        return json(response, 200, { workflows: await store.listWorkflows(...storeArgs) }, responseHeaders)
      }
      if (request.method === 'POST' && url.pathname === '/studio/workflows') {
        if (services) requireCsrf(services, authentication, request)
        return json(response, 201, await store.createWorkflow(...storeArgs, await requestBody(request)), responseHeaders)
      }
      if (studioAsset && request.method === 'GET') {
        return bytes(response, 200, 'image/png', await store.readImageAsset(...storeArgs, studioAsset[1], studioAsset[2]), responseHeaders)
      }
      if (studioAsset && request.method === 'PUT') {
        if (services) requireCsrf(services, authentication, request)
        return json(response, 200, await store.saveImageAsset(...storeArgs, studioAsset[1], await requestBody(request)), responseHeaders)
      }
      if (studioAsset && request.method === 'DELETE') {
        if (services) requireCsrf(services, authentication, request)
        await store.deleteImageAsset(...storeArgs, studioAsset[1], studioAsset[2])
        return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
      }
      if (studioWorkflow && request.method === 'GET') return json(response, 200, await store.readWorkflow(...storeArgs, studioWorkflow[1]), responseHeaders)
      if (studioWorkflow && request.method === 'PUT') {
        if (services) requireCsrf(services, authentication, request)
        return json(response, 200, await store.saveWorkflow(...storeArgs, studioWorkflow[1], await requestBody(request)), responseHeaders)
      }
      if (studioWorkflow && request.method === 'DELETE') {
        if (services) requireCsrf(services, authentication, request)
        await store.deleteWorkflow(...storeArgs, studioWorkflow[1])
        return bytes(response, 204, 'text/plain', Buffer.alloc(0), responseHeaders)
      }
      if (url.pathname.startsWith('/studio/')) throw new HttpError(404, 'NOT_FOUND', 'Unknown Studio resource')

      if (request.method === 'GET' && url.pathname === '/bridge/devices') {
        const liveDevices = [...await bridge.listDevices(), ...(services?.callbackHub?.listOnlineDevices() || [])]
        if (!services) return json(response, 200, { devices: liveDevices }, responseHeaders)
        const visibleBySerial = new Map(
          (await services.repository.listDevices(authentication.user))
            .map((device) => [device.serial, offlineBridgeDevice(device, authentication.user)]),
        )
        for (const device of liveDevices) {
          const status = await services.repository.connectedDeviceStatus(authentication.user, device.serial)
          if (status.claimed && status.authorized === false) continue
          visibleBySerial.set(device.serial, { ...visibleBySerial.get(device.serial), ...device, ...status })
        }
        return json(response, 200, { devices: [...visibleBySerial.values()] }, responseHeaders)
      }
      const bridgeScreen = BRIDGE_SCREEN_PATH.exec(url.pathname)
      if (bridgeScreen && request.method === 'GET') {
        const serial = decodeURIComponent(bridgeScreen[1])
        let deviceStatus
        if (services) {
          deviceStatus = await services.repository.connectedDeviceStatus(authentication.user, serial)
          if (deviceStatus.claimed && deviceStatus.authorized === false) throw forbidden('This account cannot access the selected device')
        }
        if (deviceStatus?.connectionMode === 'CLOUD_CALLBACK') {
          const result = await services.callbackHub.request(serial, { method: 'POST', path: '/api/screenshots' })
          return bytes(response, result.status, result.contentType, result.body, responseHeaders)
        }
        return bytes(response, 200, 'image/png', await bridge.captureScreen(serial), responseHeaders)
      }
      const bridgeTap = BRIDGE_TAP_PATH.exec(url.pathname)
      if (bridgeTap && request.method === 'POST') {
        const serial = decodeURIComponent(bridgeTap[1])
        let deviceStatus
        if (services) {
          requireCsrf(services, authentication, request)
          deviceStatus = await services.repository.connectedDeviceStatus(authentication.user, serial)
          if (deviceStatus.claimed && deviceStatus.authorized === false) throw forbidden('This account cannot access the selected device')
        }
        const payload = await requestJson(request)
        const x = Number(payload.x)
        const y = Number(payload.y)
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) throw new HttpError(422, 'INVALID_TAP', 'Tap coordinates are invalid')
        if (deviceStatus?.connectionMode === 'CLOUD_CALLBACK') {
          const result = await services.callbackHub.request(serial, {
            method: 'POST',
            path: '/api/input/tap',
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify({ x, y })),
          })
          if (result.status < 200 || result.status >= 300) return bytes(response, result.status, result.contentType, result.body, responseHeaders)
        } else await bridge.tap(serial, x, y)
        return json(response, 200, { status: 'ok', x, y }, responseHeaders)
      }
      const match = url.pathname.match(/^\/bridge\/devices\/([^/]+)\/api\//)
      if (match) {
        const serial = decodeURIComponent(match[1])
        const targetPath = agentPathFromBridgeUrl(request.url, serial)
        if (services?.callbackHub?.isOnline(serial)) {
          await services.repository.connectionForUse(authentication.user, serial)
          const requestHeaders = {}
          if (typeof request.headers['content-type'] === 'string') requestHeaders['content-type'] = request.headers['content-type']
          const result = await services.callbackHub.request(serial, {
            method: request.method,
            path: targetPath,
            headers: requestHeaders,
            body: await requestBody(request),
          })
          return bytes(response, result.status, result.contentType, result.body, {
            ...responseHeaders,
            ...([401, 403].includes(result.status) ? { 'X-AIPhone-Pairing-Rejected': '1' } : {}),
          })
        }
        const devices = await bridge.listDevices()
        const device = devices.find((candidate) => candidate.serial === serial && candidate.state === 'device')
        if (!device) throw new HttpError(404, 'DEVICE_NOT_CONNECTED', 'Device is not connected')
        let pairingToken
        if (services) {
          pairingToken = await services.repository.credentialForUse(authentication.user, serial)
          if (!pairingToken) throw unauthorized('Pairing credential is required for this device')
        }
        const port = await bridge.ensureForward(serial)
        return proxyToAgent(
          request,
          response,
          port,
          targetPath,
          () => bridge.forgetForward(serial),
          responseHeaders,
          pairingToken ? { 'X-AIPhone-Token': pairingToken } : {},
        )
      }
      if (url.pathname.startsWith('/bridge/')) throw new HttpError(404, 'NOT_FOUND', 'Unknown bridge resource')
      if (bridgeOnly) throw new HttpError(404, 'NOT_FOUND', 'Unknown bridge resource')
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
      return serveStudio(request, response)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : services ? 500 : 400
      if (structuredErrors && status >= 500) process.stderr.write(`${JSON.stringify({ level: 'error', event: 'request_failed', requestId, errorType: error?.name || 'Error', errorCode: error?.code || 'UNEXPECTED' })}\n`)
      return json(response, status, errorBody(error, requestId, structuredErrors), responseHeaders)
    }
  })
  services?.callbackHub?.attach(server)
  return server
}

export async function startStudioServer({ port = 4173, host = '127.0.0.1', bridgeOnly = false, staticOnly = false } = {}) {
  const services = staticOnly ? undefined : await createRuntimeServices()
  const bridge = process.env.AIPHONE_ADB_DISABLED === '1' ? new DisabledAdbBridge() : new AdbBridge()
  const server = createStudioServer({ bridge, bridgeOnly, staticOnly, services })
  server.listen(port, host, () => {
    process.stdout.write(`AIPhone Studio (${staticOnly ? 'static' : bridgeOnly ? 'bridge' : 'full'}): http://${host}:${port}\n`)
  })
  if (services) server.on('close', () => { void services.close() })
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridgeOnly = process.argv.includes('--bridge-only') || process.env.AIPHONE_BRIDGE_ONLY === '1'
  const staticOnly = process.argv.includes('--static-only') || process.env.AIPHONE_STATIC_ONLY === '1'
  const portArgument = process.argv.find((argument) => argument.startsWith('--port='))?.split('=', 2)[1]
  const parsedPort = Number.parseInt(portArgument || process.env.AIPHONE_STUDIO_PORT || '', 10)
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : bridgeOnly ? 4174 : 4173
  const host = process.env.AIPHONE_STUDIO_HOST || (staticOnly ? '0.0.0.0' : '127.0.0.1')
  await startStudioServer({ port, host, bridgeOnly, staticOnly })
}
