import { describe, expect, it } from 'vitest'
import { apiErrorMessage, buildAgentPath, buildBridgeDevicePath, isStandaloneLocation } from './client'

describe('isStandaloneLocation', () => {
  it('treats a secure same-origin deployment as account-aware Studio', () => {
    expect(isStandaloneLocation({ protocol: 'https:', port: '' }, '')).toBe(true)
  })

  it('keeps the Android Agent HTTP origin in embedded mode', () => {
    expect(isStandaloneLocation({ protocol: 'http:', port: '8765' }, '')).toBe(false)
  })
})

describe('buildAgentPath', () => {
  it('routes through the selected ADB serial', () => {
    expect(buildAgentPath('/api/device', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/api/device')
  })

  it('keeps direct Agent paths for the embedded Studio', () => {
    expect(buildAgentPath('/api/device', '')).toBe('/api/device')
  })
})

describe('buildBridgeDevicePath', () => {
  it('builds a host-side USB screen endpoint without going through the Agent API', () => {
    expect(buildBridgeDevicePath('/screen', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/screen')
  })
})

describe('apiErrorMessage', () => {
  it('extracts the Agent error message used by Studio notices', () => {
    expect(apiErrorMessage('{"error":{"code":"CONFLICT","message":"Workflow is running"}}', 409)).toBe('Workflow is running')
  })

  it('preserves plain bridge failures', () => {
    expect(apiErrorMessage('ADB device is not connected', 404)).toBe('ADB device is not connected')
  })
})
