import { describe, expect, it } from 'vitest'
import { languageDisplayName, voiceDisplayLabel, voiceQualityLabel } from './ttsPresentation'

describe('TTS presentation', () => {
  it('keeps the exact model ID while adding understandable language and runtime labels', () => {
    const label = voiceDisplayLabel({
      name: 'vi-vn-x-vif-local',
      languageTag: 'vi-VN',
      quality: 400,
      latency: 200,
      requiresNetwork: false,
      features: [],
    })

    expect(label).toContain(languageDisplayName('vi-VN'))
    expect(label).toContain('On-device')
    expect(label).toContain('Cao')
    expect(label).toContain('vi-vn-x-vif-local')
  })

  it('maps Android voice quality levels to user-facing labels', () => {
    expect(voiceQualityLabel(500)).toBe('Rất cao')
    expect(voiceQualityLabel(300)).toBe('Tiêu chuẩn')
    expect(voiceQualityLabel(100)).toBe('Rất thấp')
  })
})
