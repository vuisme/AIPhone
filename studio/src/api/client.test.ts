import { describe, expect, it } from 'vitest'
import { buildAgentPath } from './client'

describe('buildAgentPath', () => {
  it('routes through the selected ADB serial', () => {
    expect(buildAgentPath('/api/device', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/api/device')
  })

  it('keeps direct Agent paths for the embedded Studio', () => {
    expect(buildAgentPath('/api/device', '')).toBe('/api/device')
  })
})
