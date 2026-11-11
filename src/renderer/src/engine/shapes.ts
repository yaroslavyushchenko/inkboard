import type { Point } from './types'

export const SHAPES = [
  'line',
  'arrow',
  'doubleArrow',
  'rectangle',
  'ellipse',
  'triangle',
  'rightTriangle',
  'rhombus',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'star',
  'cube'
] as const
export type ShapeKind = (typeof SHAPES)[number]

const LINEAR: ReadonlySet<ShapeKind> = new Set(['line', 'arrow', 'doubleArrow'])

/** Snap an angle to multiples of 45° when it's within `tolDeg` of one (Shift lines). */
export function snapAngle(ax: number, ay: number, bx: number, by: number, tolDeg = 6): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len === 0) return [bx, by]
  const ang = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snapped = Math.round(ang / step) * step
  if (Math.abs(ang - snapped) > (tolDeg * Math.PI) / 180) return [bx, by]
  return [ax + Math.cos(snapped) * len, ay + Math.sin(snapped) * len]
}

const P = (x: number, y: number): Point => [x, y, 0.5]

function arrowHead(ax: number, ay: number, bx: number, by: number, size: number): Point[] {
  const len = Math.hypot(bx - ax, by - ay) || 1
  const head = Math.min(len * 0.4, Math.max(12, size * 4.5))
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const wing = (sign: number): Point => P(bx - ux * head - uy * head * 0.55 * sign, by - uy * head + ux * head * 0.55 * sign)
  return [wing(1), P(bx, by), wing(-1)]
}

function regular(cx: number, cy: number, rx: number, ry: number, n: number, rot = -Math.PI / 2): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    pts.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return pts
}

/**
 * Outline of a shape dragged from (ax, ay) to (bx, by), as one continuous polyline (closed shapes
 * repeat their first point). With `keep` (Shift) boxes become squares and lines snap to 45°.
 */
export function shapeOutline(kind: ShapeKind, ax: number, ay: number, bx: number, by: number, keep: boolean, size: number): Point[] {
  if (LINEAR.has(kind)) {
    if (keep) [bx, by] = snapAngle(ax, ay, bx, by, 45)
    if (kind === 'line') return [P(ax, ay), P(bx, by)]
    // Arrows: shaft, then the head wings, retracing the tip (one stroke, invisible overlap).
    const head = arrowHead(ax, ay, bx, by, size)
    if (kind === 'arrow') return [P(ax, ay), P(bx, by), head[0], P(bx, by), head[2]]
    const tail = arrowHead(bx, by, ax, ay, size)
    return [tail[0], P(ax, ay), tail[2], P(ax, ay), P(bx, by), head[0], P(bx, by), head[2]]
  }
  if (keep) {
    const s = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
    bx = ax + Math.sign(bx - ax || 1) * s
    by = ay + Math.sign(by - ay || 1) * s
  }
  const x0 = Math.min(ax, bx)
  const y0 = Math.min(ay, by)
  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  switch (kind) {
    case 'rectangle':
      return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)]
    case 'ellipse':
      return regular(cx, cy, w / 2, h / 2, 96, 0)
    case 'triangle':
      return [P(cx, y0), P(x1, y1), P(x0, y1), P(cx, y0)]
    case 'rightTriangle':
      return [P(x0, y0), P(x0, y1), P(x1, y1), P(x0, y0)]
    case 'rhombus':
      return [P(cx, y0), P(x1, cy), P(cx, y1), P(x0, cy), P(cx, y0)]
    case 'parallelogram': {
      const o = w * 0.25
      return [P(x0 + o, y0), P(x1, y0), P(x1 - o, y1), P(x0, y1), P(x0 + o, y0)]
    }
    case 'trapezoid': {
      const o = w * 0.22
      return [P(x0 + o, y0), P(x1 - o, y0), P(x1, y1), P(x0, y1), P(x0 + o, y0)]
    }
    case 'pentagon':
      return regular(cx, cy, w / 2, h / 2, 5)
    case 'hexagon':
      return regular(cx, cy, w / 2, h / 2, 6, 0)
    case 'star': {
      const pts: Point[] = []
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
        const r = i % 2 === 0 ? 1 : 0.4
        pts.push(P(cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r))
      }
      return pts
    }
    case 'cube': {
      // Wireframe cube; one path that covers all 12 edges (some retraced).
      const d = Math.min(w, h) * 0.3
      const F = [P(x0, y0 + d), P(x1 - d, y0 + d), P(x1 - d, y1), P(x0, y1)]
      const B = [P(x0 + d, y0), P(x1, y0), P(x1, y1 - d), P(x0 + d, y1 - d)]
      return [F[0], F[1], F[2], F[3], F[0], B[0], B[1], F[1], B[1], B[2], F[2], B[2], B[3], F[3], B[3], B[0]]
    }
    default:
      return [P(ax, ay), P(bx, by)]
  }
}

/** Shapes for which a plain click (no drag) inserts a default-size shape. */
export const DEFAULT_SHAPE_SIZE = 144
export const isLinear = (k: ShapeKind): boolean => LINEAR.has(k)
