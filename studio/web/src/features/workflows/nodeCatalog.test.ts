import { describe, expect, it } from 'vitest'
import { nodeDefinition } from './nodeCatalog'

describe('TAP_IMAGE defaults', () => {
  it('verifies the tap and retries before reporting success', () => {
    expect(nodeDefinition('TAP_IMAGE').defaultConfig).toMatchObject({
      verifyTap: true,
      tapAttempts: 2,
      tapVerificationDelayMs: 700,
    })
  })
})

describe('data and logic nodes', () => {
  it('defines typed variable fields without requiring template syntax', () => {
    const definition = nodeDefinition('SET_VARIABLE')

    expect(definition.category).toBe('Dữ liệu')
    expect(definition.fields.map((field) => field.key)).toEqual(['name', 'valueType', 'value'])
  })

  it('marks package fields as variable templates', () => {
    const packageField = nodeDefinition('LAUNCH_APP').fields.find((field) => field.key === 'packageName')

    expect(packageField).toMatchObject({ kind: 'text', supportsVariables: true })
  })

  it('routes generic IF nodes through TRUE and FALSE outcomes', () => {
    expect(nodeDefinition('IF').outcomes).toEqual([
      { id: 'TRUE', label: 'Đúng' },
      { id: 'FALSE', label: 'Sai' },
    ])
  })
})

describe('TTS Speak node', () => {
  it('supports variable text, capability-selected voices, playback and JSON output', () => {
    const definition = nodeDefinition('TTS_SPEAK')

    expect(definition.category).toBe('Âm thanh')
    expect(definition.defaultConfig).toMatchObject({
      text: 'Xin chào từ AIPhone',
      languageTag: 'vi-VN',
      speechRate: 1,
      pitch: 1,
      playAudio: false,
      saveAudio: true,
      outputVariable: 'ttsResult',
    })
    expect(definition.fields.find((field) => field.key === 'text')).toMatchObject({ supportsVariables: true })
    expect(definition.fields.find((field) => field.key === 'voice')).toMatchObject({ kind: 'ttsVoice' })
  })
})
