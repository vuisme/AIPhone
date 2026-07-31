import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPathFromBridgeUrl } from '../server.mjs'

test('agentPathFromBridgeUrl allows only a fixed device API route', () => {
  assert.equal(
    agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/workflows/default?revision=3', 'c421ff5b'),
    '/api/workflows/default?revision=3',
  )
})

test('agentPathFromBridgeUrl rejects traversal and non-API targets', () => {
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/http://127.0.0.1:22', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/c421ff5b/api/../private', 'c421ff5b'), /invalid agent path/i)
  assert.throws(() => agentPathFromBridgeUrl('/bridge/devices/other/api/device', 'c421ff5b'), /invalid agent path/i)
})
