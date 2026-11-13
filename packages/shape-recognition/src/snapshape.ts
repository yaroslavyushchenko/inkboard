import { shapeOutline } from '@inkboard/core/shapes'
import type { Point, ShapeSpec } from '@inkboard/core/types'

/**
 * Hold-to-snap shapes: draw, keep the pen still at the end, and the stroke becomes the clean shape
 * it resembles. Only a few shapes, always level:
 * - circle and oval (the Ellipse shape), rectangle and square (the Rectangle shape), triangle
 *   (the Triangle or Right triangle shape): ordinary board shapes afterwards, with side handles;
 * - arc: an open curve on one circle, kept as a clean vector line.
 * Anything else stays as drawn. Keep holding and drag to resize; Shift or a finger on the screen
 * makes it perfect (square, circle, equilateral triangle).
 */
export type SnapKind = 'circle' | 'ellipse' | 'arc' | 'rectangle' | 'square' | 'triangle' | 'rightTriangle'

export interface Snapped {
  kind: SnapKind
  points: Point[]
  /** What the shape grows from while dragging: its centre (the start of an arc). */
  pivot: [number, number]
  /** The board shape it is (every kind but the arc). */
  spec?: ShapeSpec
}

const P = 0.5
const DEG = Math.PI / 180
const pt = (x: number, y: number): Point => [x, y, P]

function pathLength(pts: readonly Point[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return n
}

function distToSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
}

/** Ramer–Douglas–Peucker simplification: the corners of a hand-drawn outline. */
function simplify(pts: readonly Point[], eps: number): Point[] {
  if (pts.length < 3) return [...pts]
  let worst = 0
  let index = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1])
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]]
  const left = simplify(pts.slice(0, index + 1), eps)
  const right = simplify(pts.slice(index), eps)
  return [...left.slice(0, -1), ...right]
}

const turnAt = (a: readonly number[], b: readonly number[], d: readonly number[]): number => {
  const v1x = b[0] - a[0], v1y = b[1] - a[1]
  const v2x = d[0] - b[0], v2y = d[1] - b[1]
  return Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y))
}

/** Corners of a closed stroke: simplified, the seam merged, and nearly straight joints dropped. */
function corners(pts: readonly Point[], eps: number): Point[] {
  let c = simplify(pts, eps)
  // The stroke starts and ends at about the same spot: that's one corner, not two.
  if (c.length > 2) c = c.slice(0, -1)
  let changed = true
  while (changed && c.length > 3) {
    changed = false
    for (let i = 0; i < c.length; i++) {
      const a = c[(i + c.length - 1) % c.length]
      const b = c[i]
      const d = c[(i + 1) % c.length]
      // Less than ~25° of turn, or a tiny edge: not a real corner.
      if (turnAt(a, b, d) < 0.44 || Math.hypot(b[0] - a[0], b[1] - a[1]) < eps || Math.hypot(d[0] - b[0], d[1] - b[1]) < eps) {
        c.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return c
}

/** A board shape from its box: the same outline the Shapes menu draws. */
function primitive(kind: ShapeSpec['kind'], ax: number, ay: number, bx: number, by: number, as: SnapKind): Snapped {
  const spec: ShapeSpec = { kind, ax, ay, bx, by }
  return { kind: as, points: shapeOutline(kind, ax, ay, bx, by, false, 0), pivot: [(ax + bx) / 2, (ay + by) / 2], spec }
}

/** Least-squares circle through the points (Kåsa fit): centre and radius. */
function fitCircle(points: readonly Point[]): { cx: number; cy: number; r: number } | null {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  const n = points.length
  for (const [x, y] of points) {
    const z = x * x + y * y
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z
  }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] · [a b c] = [sxz syz sz], circle x² + y² = a x + b y + c.
  const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]]
  for (let i = 0; i < 3; i++) {
    let p = i
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k
    ;[m[i], m[p]] = [m[p], m[i]]
    if (Math.abs(m[i][i]) < 1e-9) return null
    for (let k = 0; k < 3; k++) {
      if (k === i) continue
      const f = m[k][i] / m[i][i]
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]
    }
  }
  const a = m[0][3] / m[0][0], b = m[1][3] / m[1][1], c = m[2][3] / m[2][2]
  const cx = a / 2, cy = b / 2
  const r2 = c + cx * cx + cy * cy
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : null
}

function arcPoints(cx: number, cy: number, r: number, a0: number, sweep: number): Point[] {
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (4 * DEG)))
  const out: Point[] = []
  for (let i = 0; i <= n; i++) out.push(pt(cx + Math.cos(a0 + (sweep * i) / n) * r, cy + Math.sin(a0 + (sweep * i) / n) * r))
  return out
}

/** An open stroke is an arc when its points sit on one circle and it doesn't come back on itself. */
function arcShape(points: readonly Point[], diag: number): Snapped | null {
  // It must bulge clearly: a slightly bent straight stroke is not an arc.
  const first = points[0]
  const last = points[points.length - 1]
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1])
  let bulge = 0
  for (const p of points) bulge = Math.max(bulge, distToSegment(p, first, last))
  if (bulge < chord * 0.12) return null
  const fit = fitCircle(points)
  // A huge circle means the stroke is nearly straight: not an arc.
  if (!fit || fit.r > diag * 2) return null
  let err = 0
  for (const [x, y] of points) err += Math.abs(Math.hypot(x - fit.cx, y - fit.cy) - fit.r)
  if (err / points.length > fit.r * 0.05) return null
  let sweep = 0
  for (let i = 1; i < points.length; i++) {
    let d = Math.atan2(points[i][1] - fit.cy, points[i][0] - fit.cx) - Math.atan2(points[i - 1][1] - fit.cy, points[i - 1][0] - fit.cx)
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    sweep += d
  }
  if (Math.abs(sweep) < 30 * DEG || Math.abs(sweep) > 330 * DEG) return null
  const a0 = Math.atan2(first[1] - fit.cy, first[0] - fit.cx)
  return { kind: 'arc', points: arcPoints(fit.cx, fit.cy, fit.r, a0, sweep), pivot: [fit.cx, fit.cy] }
}

/** A right angle at the bottom left (the Right triangle shape), otherwise the Triangle shape. */
function triangleKind(c: readonly Point[], x0: number, y0: number, x1: number, y1: number): 'triangle' | 'rightTriangle' {
  const tol = Math.max(x1 - x0, y1 - y0) * 0.15
  const near = (x: number, y: number): boolean => c.some((p) => Math.hypot(p[0] - x, p[1] - y) < tol)
  return near(x0, y0) && near(x0, y1) && near(x1, y1) ? 'rightTriangle' : 'triangle'
}

/**
 * The clean shape this stroke resembles, or null when it isn't one of the snapping shapes (the
 * stroke then stays as drawn). `minSize` is the smallest shape worth snapping, in board units.
 */
export function recognizeShape(points: readonly Point[], minSize = 8): Snapped | null {
  if (points.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag < minSize) return null
  const first = points[0]
  const last = points[points.length - 1]
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1])

  // Closed when the end comes back near the start (hand-drawn circles rarely meet exactly).
  if (gap > pathLength(points) * 0.2 && gap > diag * 0.25) return arcShape(points, diag)
  if (w < minSize / 2 || h < minSize / 2) return null

  const c = corners(points, diag * 0.07)
  if (c.length === 3) {
    const kind = triangleKind(c, minX, minY, maxX, maxY)
    return primitive(kind, minX, minY, maxX, maxY, kind)
  }
  if (c.length === 4) {
    // Almost as wide as tall: a square.
    const r = w / h
    if (r > 0.9 && r < 1 / 0.9) {
      const s = (w + h) / 4
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
      return primitive('rectangle', cx - s, cy - s, cx + s, cy + s, 'square')
    }
    return primitive('rectangle', minX, minY, maxX, maxY, 'rectangle')
  }
  // Round: a circle or an oval if the points sit near the ellipse of the box.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const rx = w / 2, ry = h / 2
  let err = 0
  for (const [x, y] of points) err += Math.abs(Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) - 1)
  if (err / points.length > 0.15) return null
  const ratio = rx / ry
  if (ratio > 0.85 && ratio < 1 / 0.85) {
    const r = (rx + ry) / 2
    return primitive('ellipse', cx - r, cy - r, cx + r, cy + r, 'circle')
  }
  return primitive('ellipse', minX, minY, maxX, maxY, 'ellipse')
}

/** The perfect version (Shift or a finger): rectangle → square, oval → circle, triangle → equilateral. */
export function perfectShape(s: Snapped): Snapped {
  if (!s.spec) return s
  const [px, py] = s.pivot
  const w = Math.abs(s.spec.bx - s.spec.ax)
  const h = Math.abs(s.spec.by - s.spec.ay)
  let hw = w / 2, hh = h / 2
  let kind = s.kind
  if (s.spec.kind === 'rectangle') {
    hw = hh = Math.max(w, h) / 2
    kind = 'square'
  } else if (s.spec.kind === 'ellipse') {
    hw = hh = (w + h) / 4
    kind = 'circle'
  } else if (s.spec.kind === 'rightTriangle') hw = hh = Math.max(w, h) / 2
  else if (s.spec.kind === 'triangle') hh = (w * Math.sqrt(3)) / 4
  return primitive(s.spec.kind, px - hw, py - hh, px + hw, py + hh, kind)
}

/**
 * Keep holding after the snap and drag: the shape grows or shrinks around its pivot (it never
 * turns, so it stays level). The scale is how much further the pen is from the pivot than at
 * `from`, where it was when the shape snapped.
 */
export function holdShape(base: Snapped, from: readonly [number, number], to: readonly [number, number], perfect = false): Snapped {
  const s = perfect ? perfectShape(base) : base
  const [px, py] = s.pivot
  const la = Math.hypot(from[0] - px, from[1] - py)
  const lb = Math.hypot(to[0] - px, to[1] - py)
  // The pen sits on the pivot: nothing sensible to scale by.
  if (la < 1e-6 || lb < 1e-6) return s
  const k = lb / la
  const map = (x: number, y: number): [number, number] => [px + (x - px) * k, py + (y - py) * k]
  if (s.spec) {
    const [ax, ay] = map(s.spec.ax, s.spec.ay)
    const [bx, by] = map(s.spec.bx, s.spec.by)
    return primitive(s.spec.kind, ax, ay, bx, by, s.kind)
  }
  return { ...s, points: s.points.map(([x, y, p]): Point => [...map(x, y), p]) }
}
