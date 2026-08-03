import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { acquireCaptureSource } from './captureSource'

describe('Capture Lab source selection', () => {
  it('falls back to the legacy full screenshot endpoint for an older Agent', async () => {
    const legacy = new Blob(['legacy'], { type: 'image/png' })
    const captureLegacy = vi.fn(async () => legacy)

    const result = await acquireCaptureSource(
      async () => { throw new ApiError('Not found', 404) },
      captureLegacy,
    )

    expect(result).toEqual({ mode: 'LEGACY', preview: legacy })
    expect(captureLegacy).toHaveBeenCalledOnce()
  })

  it('does not hide capture session failures unrelated to Agent compatibility', async () => {
    const failure = new ApiError('Capture failed', 500)

    await expect(acquireCaptureSource(
      async () => { throw failure },
      async () => new Blob(),
    )).rejects.toBe(failure)
  })
})
