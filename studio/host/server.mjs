import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AdbBridge } from './adb.mjs'
import { ProjectStore } from './project-store.mjs'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const studioDirectory = path.resolve(moduleDirectory, '..', 'web', 'dist')
const BRIDGE_ORIGINS = new Set(['http://127.0.0.1:4173', 'http://localhost:4173'])
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://127.0.0.1:4174 http://localhost:4174; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}
const API_PATHS = [
  /^\/api\/device$/,
  /^\/api\/screenshots$/,
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
  /^\/api\/node-tests$/,
]
const STUDIO_WORKFLOW_PATH = /^\/studio\/workflows\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})$/
const STUDIO_ASSET_PATH = /^\/studio\/workflows\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})\/assets\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,100})$/
const MAX_STUDIO_BODY_BYTES = 12 * 1024 * 1024

export function agentPathFromBridgeUrl(rawUrl, serial) {
  const prefix = `/bridge/devices/${encodeURIComponent(serial)}`
  if (!rawUrl.startsWith(`${prefix}/`)) throw new Error('Invalid agent path')
  const target = rawUrl.slice(prefix.length)
  const pathname = target.split('?', 1)[0]
  const suspicious = /(?:\.\.|%2e|%5c|\\|\/\/)/i.test(pathname)
  if (suspicious || !API_PATHS.some((pattern) => pattern.test(pathname))) {
    throw new Error('Invalid agent path')
  }
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

async function requestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_STUDIO_BODY_BYTES) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function bridgeCorsHeaders(origin) {
  if (!origin) return {}
  if (!BRIDGE_ORIGINS.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-AIPhone-Token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

async function serveStudio(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  const relative = requestPath === '/' ? 'index.html' : requestPath.slice(1)
  if (relative.includes('..') || relative.includes('\\')) return json(response, 400, { error: 'Invalid path' })
  let target = path.resolve(studioDirectory, relative)
  if (!target.startsWith(`${studioDirectory}${path.sep}`) && target !== studioDirectory) {
    return json(response, 400, { error: 'Invalid path' })
  }
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

function proxyToAgent(request, response, port, targetPath, onError, extraHeaders = {}) {
  const proxy = http.request({
    hostname: '127.0.0.1',
    port,
    path: targetPath,
    method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${port}`, connection: 'close' },
  }, (agentResponse) => {
    response.writeHead(agentResponse.statusCode || 502, {
      ...agentResponse.headers,
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    })
    agentResponse.pipe(response)
  })
  proxy.setTimeout(20_000, () => proxy.destroy(new Error('Agent request timed out')))
  proxy.on('error', (error) => {
    onError?.()
    if (response.headersSent) response.destroy(error)
    else json(response, 502, { error: error.message }, extraHeaders)
  })
  request.pipe(proxy)
}

export function createStudioServer({ bridge = new AdbBridge(), projectStore = new ProjectStore(), bridgeOnly = false, staticOnly = false } = {}) {
  return http.createServer(async (request, response) => {
    let responseHeaders = {}
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const corsHeaders = bridgeOnly ? bridgeCorsHeaders(request.headers.origin) : {}
      if (corsHeaders === null) return json(response, 403, { error: 'Origin is not allowed' })
      responseHeaders = corsHeaders
      if (bridgeOnly && request.method === 'OPTIONS' && (url.pathname.startsWith('/bridge/') || url.pathname.startsWith('/studio/'))) {
        response.writeHead(204, corsHeaders)
        return response.end()
      }
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json(response, 200, { status: 'ok', mode: staticOnly ? 'static' : bridgeOnly ? 'bridge' : 'full' }, corsHeaders)
      }
      if (staticOnly && (url.pathname.startsWith('/bridge/') || url.pathname.startsWith('/studio/'))) {
        return json(response, 404, { error: 'Studio data and USB bridge run on the host' })
      }
      const studioWorkflow = STUDIO_WORKFLOW_PATH.exec(url.pathname)
      const studioAsset = STUDIO_ASSET_PATH.exec(url.pathname)
      if (request.method === 'GET' && url.pathname === '/studio/workflows') {
        return json(response, 200, { workflows: await projectStore.listWorkflows() }, corsHeaders)
      }
      if (request.method === 'POST' && url.pathname === '/studio/workflows') {
        return json(response, 201, await projectStore.createWorkflow(await requestBody(request)), corsHeaders)
      }
      if (studioAsset && request.method === 'GET') {
        return bytes(response, 200, 'image/png', await projectStore.readImageAsset(studioAsset[1], studioAsset[2]), corsHeaders)
      }
      if (studioAsset && request.method === 'PUT') {
        return json(response, 200, await projectStore.saveImageAsset(studioAsset[1], await requestBody(request)), corsHeaders)
      }
      if (studioAsset && request.method === 'DELETE') {
        await projectStore.deleteImageAsset(studioAsset[1], studioAsset[2])
        return bytes(response, 204, 'text/plain', Buffer.alloc(0), corsHeaders)
      }
      if (studioWorkflow && request.method === 'GET') {
        return json(response, 200, await projectStore.readWorkflow(studioWorkflow[1]), corsHeaders)
      }
      if (studioWorkflow && request.method === 'PUT') {
        return json(response, 200, await projectStore.saveWorkflow(studioWorkflow[1], await requestBody(request)), corsHeaders)
      }
      if (studioWorkflow && request.method === 'DELETE') {
        await projectStore.deleteWorkflow(studioWorkflow[1])
        return bytes(response, 204, 'text/plain', Buffer.alloc(0), corsHeaders)
      }
      if (url.pathname.startsWith('/studio/')) return json(response, 404, { error: 'Unknown Studio resource' }, corsHeaders)
      if (request.method === 'GET' && url.pathname === '/bridge/devices') {
        return json(response, 200, { devices: await bridge.listDevices() }, corsHeaders)
      }
      const match = url.pathname.match(/^\/bridge\/devices\/([^/]+)\/api\//)
      if (match) {
        const serial = decodeURIComponent(match[1])
        const devices = await bridge.listDevices()
        const device = devices.find((candidate) => candidate.serial === serial && candidate.state === 'device')
        if (!device) return json(response, 404, { error: 'ADB device is not connected' }, corsHeaders)
        const targetPath = agentPathFromBridgeUrl(request.url, serial)
        const port = await bridge.ensureForward(serial)
        return proxyToAgent(request, response, port, targetPath, () => bridge.forgetForward(serial), corsHeaders)
      }
      if (url.pathname.startsWith('/bridge/')) return json(response, 404, { error: 'Unknown bridge resource' }, corsHeaders)
      if (bridgeOnly) return json(response, 404, { error: 'Unknown bridge resource' }, corsHeaders)
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'Method not allowed' })
      return serveStudio(request, response)
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' }, responseHeaders)
    }
  })
}

export function startStudioServer({ port = 4173, host = '127.0.0.1', bridgeOnly = false, staticOnly = false } = {}) {
  const server = createStudioServer({ bridgeOnly, staticOnly })
  server.listen(port, host, () => {
    process.stdout.write(`AIPhone Studio (${staticOnly ? 'static' : bridgeOnly ? 'bridge' : 'full'}): http://${host}:${port}\n`)
  })
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridgeOnly = process.argv.includes('--bridge-only') || process.env.AIPHONE_BRIDGE_ONLY === '1'
  const staticOnly = process.argv.includes('--static-only') || process.env.AIPHONE_STATIC_ONLY === '1'
  const portArgument = process.argv.find((argument) => argument.startsWith('--port='))?.split('=', 2)[1]
  const parsedPort = Number.parseInt(portArgument || process.env.AIPHONE_STUDIO_PORT || '', 10)
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : bridgeOnly ? 4174 : 4173
  const host = process.env.AIPHONE_STUDIO_HOST || (staticOnly ? '0.0.0.0' : '127.0.0.1')
  startStudioServer({ port, host, bridgeOnly, staticOnly })
}
