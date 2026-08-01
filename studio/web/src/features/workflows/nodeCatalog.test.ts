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
