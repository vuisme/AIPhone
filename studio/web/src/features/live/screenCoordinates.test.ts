import { describe, expect, it } from 'vitest'
import { mapScreenPoint } from './screenCoordinates'

describe('mapScreenPoint', () => {
  it('maps a displayed preview click to native Android coordinates', () => {
    expect(mapScreenPoint({ clientX: 350, clientY: 175 }, { left: 100, top: 50, width: 500, height: 250 }, { width: 2000, height: 1000 })).toEqual({ x: 1000, y: 500 })
  })

  it('clamps pointer coordinates to the native display', () => {
    expect(mapScreenPoint({ clientX: 999, clientY: -20 }, { left: 100, top: 50, width: 500, height: 250 }, { width: 2000, height: 1000 })).toEqual({ x: 1999, y: 0 })
  })
})
