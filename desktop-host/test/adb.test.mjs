import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAdbDevices, parseAdbForwards, requireConnectedSerial } from '../adb.mjs'

test('parseAdbDevices returns usable USB devices and preserves offline entries', () => {
  const output = `List of devices attached
c421ff5b             device product:flame model:2509FPN0BC device:flame transport_id:4
emulator-5554        offline transport_id:7
unauthorized-phone   unauthorized usb:1-2 transport_id:8

`

  assert.deepEqual(parseAdbDevices(output), [
    { serial: 'c421ff5b', state: 'device', model: '2509FPN0BC', product: 'flame', transportId: '4' },
    { serial: 'emulator-5554', state: 'offline', model: null, product: null, transportId: '7' },
    { serial: 'unauthorized-phone', state: 'unauthorized', model: null, product: null, transportId: '8' },
  ])
})

test('parseAdbForwards finds reusable Agent forwards by serial', () => {
  assert.deepEqual(parseAdbForwards('c421ff5b tcp:55676 tcp:8765\nother tcp:60000 tcp:9000\n'), [
    { serial: 'c421ff5b', local: 'tcp:55676', remote: 'tcp:8765' },
    { serial: 'other', local: 'tcp:60000', remote: 'tcp:9000' },
  ])
})

test('requireConnectedSerial accepts only an exact connected serial', () => {
  const devices = [
    { serial: 'c421ff5b', state: 'device', model: '2509FPN0BC', product: null, transportId: '4' },
    { serial: 'offline-phone', state: 'offline', model: null, product: null, transportId: '5' },
  ]

  assert.equal(requireConnectedSerial(devices, 'c421ff5b').serial, 'c421ff5b')
  assert.throws(() => requireConnectedSerial(devices, 'c421'), /not connected/i)
  assert.throws(() => requireConnectedSerial(devices, 'offline-phone'), /not connected/i)
  assert.throws(() => requireConnectedSerial(devices, '../c421ff5b'), /not connected/i)
})
