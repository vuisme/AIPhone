import { describe, expect, it } from 'vitest'
import { clampSelection, displayToNativeRect, displayToNormalizedRect } from './crop'

describe('Asset crop coordinates', () => {
  it('maps CSS display pixels to native screenshot pixels', () => {
    expect(
      displayToNativeRect(
        { x: 130, y: 60, width: 260, height: 120 },
        { width: 1304, height: 600 },
        { width: 2608, height: 1200 },
      ),
    ).toEqual({ x: 260, y: 120, width: 520, height: 240 })
  })

  it('normalizes a selection dragged from bottom-right to top-left', () => {
    expect(clampSelection({ x: 400, y: 300 }, { x: 100, y: 80 }, { width: 500, height: 400 })).toEqual({
      x: 100,
      y: 80,
      width: 300,
      height: 220,
    })
  })

  it('clamps a selection to the screenshot bounds', () => {
    expect(clampSelection({ x: -20, y: 20 }, { x: 550, y: 460 }, { width: 500, height: 400 })).toEqual({
      x: 0,
      y: 20,
      width: 500,
      height: 380,
    })
  })

  it('converts a displayed selection to device-independent normalized coordinates', () => {
    expect(
      displayToNormalizedRect(
        { x: 130.4, y: 60, width: 260.8, height: 120 },
        { width: 1304, height: 600 },
      ),
    ).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })
  })
})
