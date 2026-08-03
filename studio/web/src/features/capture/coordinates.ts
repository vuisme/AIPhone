import type { Point, Size } from './crop'

export type GestureMode = 'TAP' | 'SWIPE'

export interface GestureSelection {
  start: Point
  end?: Point
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function displayPointToNative(point: Point, display: Size, native: Size): Point {
  const x = display.width > 0 ? Math.round(point.x * native.width / display.width) : 0
  const y = display.height > 0 ? Math.round(point.y * native.height / display.height) : 0
  return {
    x: clamp(x, 0, Math.max(0, native.width - 1)),
    y: clamp(y, 0, Math.max(0, native.height - 1)),
  }
}

export function gestureConfig(mode: GestureMode, selection: GestureSelection): Record<string, number> {
  if (mode === 'TAP') return { x: selection.start.x, y: selection.start.y }
  const end = selection.end ?? selection.start
  return { x1: selection.start.x, y1: selection.start.y, x2: end.x, y2: end.y }
}
