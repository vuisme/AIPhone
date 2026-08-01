import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPathFromBridgeUrl, bridgeCorsHeaders, createStudioServer } from '../server.mjs'

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
})

test('agentPathFromBridgeUrl rejects traversal and non-API targets', () => {
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/http://127.0.0.1:22', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/../private', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/other/api/device', 'c421ff5b'), /invalid agent path/i)
})

test('bridge-only CORS accepts only local Studio origins', () => {
  assert.equal(bridgeCorsHeaders('http://127.0.0.1:4173')['Access-Control-Allow-Origin'], 'http://127.0.0.1:4173')
  assert.equal(bridgeCorsHeaders('http://localhost:4173')['Access-Control-Allow-Origin'], 'http://localhost:4173')
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
