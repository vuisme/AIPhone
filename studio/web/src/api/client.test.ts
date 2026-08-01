import { describe, expect, it } from 'vitest'
import { apiErrorMessage, buildAgentPath } from './client'

describe('buildAgentPath', () => {
  it('routes through the selected ADB serial', () => {
    expect(buildAgentPath('/api/device', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/api/device')
  })

  it('keeps direct Agent paths for the embedded Studio', () => {
    expect(buildAgentPath('/api/device', '')).toBe('/api/device')
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
