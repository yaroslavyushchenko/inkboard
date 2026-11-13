import { bboxOfPoints } from './geometry'
import type { Point, StrokeItem } from './types'

/** Squared distance from (px, py) to the segment a → b. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  const x = ax + dx * t - px
  const y = ay + dy * t - py
  return x * x + y * y
}

/** Points along the line, no further apart than `step` (straight lines keep their exact path). */
function densify(points: readonly Point[], step: number): Point[] {
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, ap] = points[i - 1]
    const [bx, by, bp] = points[i]
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step)
    for (let k = 1; k < n; k++) {
      const t = k / n
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t])
    }
    out.push(points[i])
  }
  return out
}

/**
 * Point eraser: cuts the part of a stroke that the eraser circle covers while it moves from
 * (x0, y0) to (x1, y1). Returns null when the stroke isn't touched, otherwise the pieces that
 * remain (an empty list when all of it is gone). The pieces are ordinary vector strokes; a piece
 * keeps a line end (arrow, dot…) only where the original end survived, and pieces of a shape
 * become plain lines (they can no longer be re-generated as that shape).
 */
export function splitStroke(
  stroke: StrokeItem,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  newId: () => string
): StrokeItem[] | null {
  const rr = r + stroke.size / 2
  const rr2 = rr * rr
  const inside = (p: Point): boolean => segDist2(p[0], p[1], x0, y0, x1, y1) <= rr2
  // Fine enough that the cut edge sits close to the eraser circle.
  const pts = densify(stroke.points, Math.max(0.5, r / 3))
  const runs: Point[][] = []
  let cur: Point[] = []
  let touched = false
  for (const p of pts) {
    if (inside(p)) {
      touched = true
      if (cur.length) runs.push(cur)
      cur = []
    } else cur.push(p)
  }
  if (cur.length) runs.push(cur)
  if (!touched) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  const { shape: _shape, groupId: _groupId, startCap, endCap, ...rest } = stroke
  return runs
    // A lone point left behind is a speck, not ink worth keeping (unless it was a dot all along).
    .filter((run) => run.length > 1)
    .map((run) => {
      const piece: StrokeItem = { ...rest, id: newId(), points: run, bbox: bboxOfPoints(run, stroke.geom ? stroke.size * 3 : stroke.size) }
      if (startCap && run[0] === first) piece.startCap = startCap
      if (endCap && run[run.length - 1] === last) piece.endCap = endCap
      // Pieces of an ordinary group stay in it; pieces of a shape don't form that shape any more.
      if (stroke.groupId && !stroke.shape) piece.groupId = stroke.groupId
      return piece
    })
}
