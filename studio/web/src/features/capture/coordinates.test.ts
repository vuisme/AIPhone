import { describe, expect, it } from 'vitest'
import { displayPointToNative, gestureConfig } from './coordinates'

describe('Capture Lab gesture coordinates', () => {
  it('maps a point from the displayed preview to the native device screen', () => {
    expect(displayPointToNative(
      { x: 652, y: 300 },
      { width: 1304, height: 600 },
      { width: 2608, height: 1200 },
    )).toEqual({ x: 1304, y: 600 })
  })

  it('clamps points outside the preview to valid device pixels', () => {
    expect(displayPointToNative(
      { x: 1400, y: -20 },
      { width: 1304, height: 600 },
      { width: 2608, height: 1200 },
    )).toEqual({ x: 2607, y: 0 })
  })

  it('maps tap and swipe results to their node config fields', () => {
    expect(gestureConfig('TAP', { start: { x: 120, y: 240 } })).toEqual({ x: 120, y: 240 })
    expect(gestureConfig('SWIPE', { start: { x: 120, y: 240 }, end: { x: 800, y: 900 } })).toEqual({
      x1: 120,
      y1: 240,
      x2: 800,
      y2: 900,
    })
  })
})
