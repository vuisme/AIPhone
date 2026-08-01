interface Point { clientX: number; clientY: number }
interface Rect { left: number; top: number; width: number; height: number }
interface Size { width: number; height: number }

export function mapScreenPoint(point: Point, rect: Rect, native: Size): { x: number; y: number } {
  const normalizedX = rect.width > 0 ? (point.clientX - rect.left) / rect.width : 0
  const normalizedY = rect.height > 0 ? (point.clientY - rect.top) / rect.height : 0
  return {
    x: Math.min(native.width - 1, Math.max(0, Math.round(normalizedX * native.width))),
    y: Math.min(native.height - 1, Math.max(0, Math.round(normalizedY * native.height))),
  }
}
