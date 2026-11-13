import type { BBox, Point } from './types'

export function bboxOfPoints(points: readonly Point[], pad: number): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx - px
  const cy = ay + t * dy - py
  return cx * cx + cy * cy
}

/** Does a circle of radius r at (px, py) touch the polyline? */
export function circleHitsPolyline(
  px: number,
  py: number,
  r: number,
  points: readonly Point[]
): boolean {
  const rSq = r * r
  if (points.length === 1) {
    const dx = points[0][0] - px
    const dy = points[0][1] - py
    return dx * dx + dy * dy <= rSq
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (distToSegmentSq(px, py, a[0], a[1], b[0], b[1]) <= rSq) return true
  }
  return false
}

let idCounter = 0
export function newId(): string {
  idCounter++
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
