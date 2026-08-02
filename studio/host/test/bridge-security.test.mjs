import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { agentPathFromBridgeUrl, bridgeCorsHeaders, createStudioServer } from '../server.mjs'
import { ProjectStore } from '../project-store.mjs'
import { forbidden, unauthorized } from '../errors.mjs'

function jsonResponse(response, body) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function withServer(options, run) {
  const server = createStudioServer(options)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function securedServices(repository = {}) {
  const user = { id: 'member', role: 'USER', status: 'ACTIVE', email: 'member@example.com', displayName: 'Member' }
  return {
    auth: {
      authenticate: async (token) => {
        if (token !== 'session-token') throw unauthorized()
        return { user, token, session: { userId: user.id, csrfToken: 'csrf-token' } }
      },
      assertCsrf: (_authentication, token) => { if (token !== 'csrf-token') throw forbidden('CSRF token is invalid') },
    },
    repository,
    sessions: {},
    importLegacy: async () => ({ imported: 0 }),
  }
}

test('agentPathFromBridgeUrl allows only fixed device API routes', () => {
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/workflows/default?revision=3', 'c421ff5b'),
    '/api/workflows/default?revision=3',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/workflows/reward-flow/assets/skip-button', 'c421ff5b'),
    '/api/workflows/reward-flow/assets/skip-button',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/ui-hierarchy', 'c421ff5b'),
    '/api/ui-hierarchy',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/workflows/reward-flow/inventory', 'c421ff5b'),
    '/api/workflows/reward-flow/inventory',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/capabilities/tts', 'c421ff5b'),
    '/api/capabilities/tts',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/capabilities/runtime', 'c421ff5b'),
    '/api/capabilities/runtime',
  )
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/runs/audio/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8', 'c421ff5b'),
    '/api/runs/audio/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8',
  )
})

test('agentPathFromBridgeUrl rejects traversal and non-API targets', () => {
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/http://127.0.0.1:22', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/../private', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/other/api/device', 'c421ff5b'), /invalid agent path/i)
})

test('bridge-only CORS accepts only local Studio origins', () => {
  assert.equal(bridgeCorsHeaders('http://127.0.0.1:4173')['Access-Control-Allow-Origin'], 'http://127.0.0.1:4173')
  assert.equal(bridgeCorsHeaders('http://localhost:4173')['Access-Control-Allow-Origin'], 'http://localhost:4173')
  assert.equal(bridgeCorsHeaders('http://127.0.0.1:4175')['Access-Control-Allow-Origin'], 'http://127.0.0.1:4175')
  assert.equal(bridgeCorsHeaders('http://localhost:4175')['Access-Control-Allow-Origin'], 'http://localhost:4175')
  assert.equal(bridgeCorsHeaders('http://192.168.1.5:4173'), null)
  assert.deepEqual(bridgeCorsHeaders(undefined), {})
})

test('bridge-only server exposes devices to the local Docker Studio origin', async () => {
  const bridge = { listDevices: async () => [] }
  await withServer({ bridge, bridgeOnly: true }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, {
      headers: { Origin: 'http://127.0.0.1:4173' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.deepEqual(await response.json(), { devices: [] })
  })
})

test('bridge-only server rejects non-local browser origins', async () => {
  const bridge = { listDevices: async () => [] }
  await withServer({ bridge, bridgeOnly: true }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, {
      headers: { Origin: 'http://192.168.1.5:4173' },
    })
    assert.equal(response.status, 403)
  })
})

test('secured bridge rejects requests without an authenticated cookie', async () => {
  const bridge = { listDevices: async () => [] }
  await withServer({ bridge, bridgeOnly: true, services: securedServices() }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, { headers: { Origin: 'http://127.0.0.1:4173' } })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.code, 'AUTH_REQUIRED')
  })
})

test('secured bridge keeps paired account devices visible while offline', async () => {
  const bridge = { listDevices: async () => [] }
  const repository = {
    listDevices: async () => [{
      id: 'device-row',
      serial: 'cloud:device-1',
      label: 'Xiaomi test',
      model: '2509FPN0BC',
      connectionMode: 'CLOUD_CALLBACK',
      ownerUserId: 'member',
      ownerDisplayName: 'Member',
      hasCredential: false,
    }],
    connectedDeviceStatus: async () => { throw new Error('offline devices must not require another lookup') },
  }
  const services = securedServices(repository)
  services.callbackHub = { attach: () => undefined, listOnlineDevices: () => [] }

  await withServer({ bridge, bridgeOnly: true, services }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, {
      headers: { Origin: 'http://127.0.0.1:4173', Cookie: 'aiphone.sid=session-token' },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      devices: [{
        serial: 'cloud:device-1',
        state: 'offline',
        model: '2509FPN0BC',
        product: null,
        transportId: null,
        claimed: true,
        authorized: true,
        paired: true,
        canPair: false,
        deviceId: 'device-row',
        connectionMode: 'CLOUD_CALLBACK',
        ownerUserId: 'member',
        ownerDisplayName: 'Member',
        label: 'Xiaomi test',
      }],
    })
  })
})

test('secured full Studio serves the login shell without a session cookie', async () => {
  await withServer({ bridge: { listDevices: async () => [] }, services: securedServices() }, async (origin) => {
    const response = await fetch(`${origin}/`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /^text\/html/)
    assert.match(await response.text(), /id="app"/)
  })
})

test('secured bridge hides unexpected backend details behind a request ID', async () => {
  const bridge = { listDevices: async () => [{ serial: 'phone', state: 'device' }] }
  const repository = { connectedDeviceStatus: async () => { throw new Error('password=database-secret') } }
  await withServer({ bridge, bridgeOnly: true, services: securedServices(repository) }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, {
      headers: { Origin: 'http://127.0.0.1:4173', Cookie: 'aiphone.sid=session-token' },
    })
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.equal(body.error.message, 'The request could not be completed')
    assert.equal(JSON.stringify(body).includes('database-secret'), false)
    assert.ok(body.requestId)
  })
})

test('secured proxy ignores browser tokens and injects the authorized stored credential', async () => {
  const agent = http.createServer((request, response) => {
    jsonResponse(response, { pairingToken: request.headers['x-aiphone-token'] })
  })
  await new Promise((resolve) => agent.listen(0, '127.0.0.1', resolve))
  const agentPort = agent.address().port
  const bridge = {
    listDevices: async () => [{ serial: 'phone', state: 'device' }],
    ensureForward: async () => agentPort,
    forgetForward: () => undefined,
  }
  const repository = {
    credentialForUse: async () => 'stored-secret-token',
  }
  try {
    await withServer({ bridge, bridgeOnly: true, services: securedServices(repository) }, async (origin) => {
      const response = await fetch(`${origin}/bridge/devices/phone/api/device`, {
        headers: {
          Origin: 'http://127.0.0.1:4173',
          Cookie: 'aiphone.sid=session-token',
          'X-AIPhone-Token': 'browser-supplied-token',
        },
      })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { pairingToken: 'stored-secret-token' })
    })
  } finally {
    await new Promise((resolve) => agent.close(resolve))
  }
})

test('secured bridge tunnels authorized Agent API requests through Cloud Callback', async () => {
  const calls = []
  const repository = { connectionForUse: async (_user, serial) => { calls.push(['authorize', serial]); return { serial, connectionMode: 'CLOUD_CALLBACK' } } }
  const services = securedServices(repository)
  services.callbackHub = {
    attach: () => undefined,
    isOnline: (serial) => serial === 'cloud:device-1',
    request: async (serial, command) => {
      calls.push(['request', serial, command.method, command.path, command.body.toString()])
      return { status: 200, contentType: 'application/json', body: Buffer.from('{"transport":"callback"}') }
    },
  }
  await withServer({ bridge: { listDevices: async () => { throw new Error('ADB must not run') } }, bridgeOnly: true, services }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices/cloud%3Adevice-1/api/device`, {
      headers: { Origin: 'http://127.0.0.1:4173', Cookie: 'aiphone.sid=session-token' },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { transport: 'callback' })
    assert.deepEqual(calls, [
      ['authorize', 'cloud:device-1'],
      ['request', 'cloud:device-1', 'GET', '/api/device', ''],
    ])
  })
})

test('authenticated users claim a live callback device with CSRF protection', async () => {
  const audit = []
  const repository = { recordAudit: async (event) => audit.push(event) }
  const services = securedServices(repository)
  services.callbackHub = {
    attach: () => undefined,
    claim: async (_user, code) => ({ id: 'callback-row', serial: 'cloud:device-1', label: `Phone ${code}`, connectionMode: 'CLOUD_CALLBACK' }),
  }
  await withServer({ bridge: { listDevices: async () => [] }, bridgeOnly: true, services }, async (origin) => {
    const response = await fetch(`${origin}/studio/callback-pairings`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:4173', Cookie: 'aiphone.sid=session-token', 'X-CSRF-Token': 'csrf-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCDE23456' }),
    })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).serial, 'cloud:device-1')
    assert.equal(audit[0].action, 'CALLBACK_DEVICE_PAIRED')
  })
})

test('bridge-only server preserves CORS headers when ADB fails', async () => {
  const bridge = { listDevices: async () => { throw new Error('ADB unavailable') } }
  await withServer({ bridge, bridgeOnly: true }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices`, {
      headers: { Origin: 'http://127.0.0.1:4173' },
    })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173')
    assert.deepEqual(await response.json(), { error: 'ADB unavailable' })
  })
})

test('bridge-only server exposes rootless screen capture and bounded tap input', async () => {
  const calls = []
  const bridge = {
    listDevices: async () => [{ serial: 'phone', state: 'device' }],
    captureScreen: async (serial) => { calls.push(['screen', serial]); return Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    tap: async (serial, x, y) => { calls.push(['tap', serial, x, y]) },
  }
  await withServer({ bridge, bridgeOnly: true }, async (origin) => {
    const headers = { Origin: 'http://127.0.0.1:4173' }
    const screen = await fetch(`${origin}/bridge/devices/phone/screen`, { headers })
    assert.equal(screen.status, 200)
    assert.equal(screen.headers.get('content-type'), 'image/png')

    const tap = await fetch(`${origin}/bridge/devices/phone/input/tap`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 120, y: 340 }),
    })
    assert.equal(tap.status, 200)
    assert.deepEqual(calls, [['screen', 'phone'], ['tap', 'phone', 120, 340]])
  })
})

test('bridge-only tap endpoint rejects invalid coordinates', async () => {
  const bridge = {
    listDevices: async () => [{ serial: 'phone', state: 'device' }],
    tap: async () => { throw new Error('must not run') },
  }
  await withServer({ bridge, bridgeOnly: true }, async (origin) => {
    const response = await fetch(`${origin}/bridge/devices/phone/input/tap`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: -1, y: 340 }),
    })
    assert.equal(response.status, 422)
    assert.match((await response.json()).error, /coordinates/i)
  })
})

test('bridge-only server persists canonical Studio workflows with local CORS', async () => {
  const bridge = { listDevices: async () => [] }
  const projectStore = new ProjectStore(await mkdtemp(path.join(os.tmpdir(), 'aiphone-http-store-')))
  const workflow = { schemaVersion: 2, id: 'fleet', name: 'Fleet', revision: 1, nodes: [], edges: [], assets: [], createdAt: '', updatedAt: '' }
  await withServer({ bridge, bridgeOnly: true, projectStore }, async (origin) => {
    const created = await fetch(`${origin}/studio/workflows`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    })
    assert.equal(created.status, 201)
    assert.equal(created.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173')

    const listed = await fetch(`${origin}/studio/workflows`, { headers: { Origin: 'http://127.0.0.1:4173' } })
    assert.deepEqual(await listed.json(), { workflows: [{ id: 'fleet', name: 'Fleet', revision: 1, nodeCount: 0, assetCount: 0, updatedAt: '' }] })
  })
})
