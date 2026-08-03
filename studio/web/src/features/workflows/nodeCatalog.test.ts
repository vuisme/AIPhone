import { describe, expect, it } from 'vitest'
import { WORKFLOW_NODE_TYPES } from '../../contracts/workflow'
import { NODE_CATALOG, nodeDefinition, nodeRequirement, nodeRequirementLabel, rootBadgeLabel } from './nodeCatalog'

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

describe('node capability matrix', () => {
  it('exposes every public workflow action in the Studio catalog', () => {
    expect(NODE_CATALOG.map((item) => item.type).sort()).toEqual([...WORKFLOW_NODE_TYPES].sort())
  })

  it('classifies image actions as root or Accessibility', () => {
    for (const type of ['WAIT_IMAGE', 'IF_IMAGE', 'TAP_IMAGE'] as const) {
      expect(nodeRequirement(type, {})).toBe('ACCESSIBILITY_OR_ROOT')
      expect(nodeRequirementLabel(type, {})).toBe('ROOT / TRỢ NĂNG')
    }
  })

  it('keeps clone actions root-only and changes app launch by Android user', () => {
    expect(nodeRequirement('CREATE_CLONE', { userId: 999 })).toBe('ROOT')
    expect(nodeRequirement('FORCE_STOP_APP', { userId: 0 })).toBe('ROOT')
    expect(nodeRequirement('LAUNCH_APP', { userId: 0 })).toBe('NONE')
    expect(nodeRequirement('LAUNCH_APP', { userId: 999 })).toBe('ROOT')
    expect(nodeRequirement('LAUNCH_APP', { userId: '{{ targetUser }}' })).toBe('NONE')
  })

  it('shows a compact ROOT badge only when the current node configuration requires root', () => {
    expect(rootBadgeLabel('CREATE_CLONE', { userId: 999 })).toBe('ROOT')
    expect(rootBadgeLabel('WAIT_IMAGE', {})).toBeUndefined()
    expect(rootBadgeLabel('TAP_TEXT', {})).toBeUndefined()
    expect(rootBadgeLabel('LAUNCH_APP', { userId: 0 })).toBeUndefined()
    expect(rootBadgeLabel('LAUNCH_APP', { userId: 999 })).toBe('ROOT')
  })

  it('requires Accessibility specifically for text matching', () => {
    expect(nodeRequirement('TAP_TEXT', {})).toBe('ACCESSIBILITY')
    expect(nodeRequirementLabel('TAP_TEXT', {})).toBe('TRỢ NĂNG')
  })
})
