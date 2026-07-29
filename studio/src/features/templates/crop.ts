export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function clampSelection(start: Point, end: Point, bounds: Size): Rect {
  const startX = clamp(start.x, 0, bounds.width)
  const startY = clamp(start.y, 0, bounds.height)
  const endX = clamp(end.x, 0, bounds.width)
  const endY = clamp(end.y, 0, bounds.height)

  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

export function displayToNativeRect(selection: Rect, display: Size, native: Size): Rect {
  const scaleX = native.width / display.width
  const scaleY = native.height / display.height

  return {
    x: Math.round(selection.x * scaleX),
    y: Math.round(selection.y * scaleY),
    width: Math.round(selection.width * scaleX),
    height: Math.round(selection.height * scaleY),
  }
}
