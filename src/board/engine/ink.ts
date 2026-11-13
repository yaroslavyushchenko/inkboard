import { getStroke, type StrokeOptions } from 'perfect-freehand'
import { highlightBlend, inkColor, inkPaper } from './surface'
import type { LineCap, LineDash, Point, StrokeItem } from '@inkboard/core/types'

export const HIGHLIGHTER_ALPHA = 0.38

export interface InkStyle {
  tool: StrokeItem['tool']
  size: number
  pressure: boolean
}

function optionsFor(style: InkStyle, last: boolean): StrokeOptions {
  const isPen = style.tool === 'pen'
  return {
    size: style.size,
    // Real pressure → variable width. Mouse / highlighter → uniform width.
    thinning: isPen && style.pressure ? 0.6 : 0,
    smoothing: 0.5,
    streamline: isPen ? 0.35 : 0.5,
    simulatePressure: false,
    easing: (t) => t,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last
  }
}

/** Turn a perfect-freehand outline polygon into a smooth closed Path2D (quadratic curves). */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D()
  const n = outline.length
  if (n === 0) return path
  if (n < 3) {
    path.arc(outline[0][0], outline[0][1], 0.5, 0, Math.PI * 2)
    return path
  }
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
  path.closePath()
  return path
}

/** SVG path data of a stroke's filled outline (same geometry as on screen), for vector export. */
export function inkOutlineSvg(s: StrokeItem): string {
  const o = getStroke(s.points as Point[], optionsFor(s, true))
  const n = o.length
  if (n === 0) return ''
  const f = (v: number): string => (Math.round(v * 100) / 100).toString()
  if (n < 3) {
    const r = Math.max(s.size / 2, 0.5)
    return `M${f(o[0][0] - r)},${f(o[0][1])}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`
  }
  let d = `M${f(o[0][0])},${f(o[0][1])}`
  for (let i = 1; i < n; i++) {
    const a = o[i]
    const b = o[(i + 1) % n]
    d += `Q${f(a[0])},${f(a[1])} ${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2)}`
  }
  return `${d}Z`
}

export function buildInkPath(points: readonly Point[], style: InkStyle, last: boolean): Path2D {
  return outlineToPath(getStroke(points as Point[], optionsFor(style, last)))
}

// Paths are in world coordinates, so one cached Path2D is valid at every zoom level:
// the canvas transform scales the vector outline, it is never a bitmap.
const pathCache = new WeakMap<StrokeItem, Path2D>()

export function strokePath(s: StrokeItem): Path2D {
  let p = pathCache.get(s)
  if (!p) {
    p = buildInkPath(s.points, s, true)
    pathCache.set(s, p)
  }
  return p
}

export function fillInk(ctx: CanvasRenderingContext2D, path: Path2D, color: string, tool: InkStyle['tool']): void {
  ctx.fillStyle = inkColor(color)
  if (tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.globalCompositeOperation = highlightBlend()
    ctx.fill(path)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.fill(path)
  }
}

// ---------------------------------------------------------------------------- straight lines & shapes

/** Polyline through the exact points (Shift lines and shapes): uniform width, crisp corners. */
export function linePath(points: readonly Point[]): Path2D {
  const p = new Path2D()
  if (points.length === 0) return p
  p.moveTo(points[0][0], points[0][1])
  // A single point still needs a visible dot: a tiny segment with round caps.
  if (points.length === 1) p.lineTo(points[0][0] + 0.01, points[0][1])
  for (let i = 1; i < points.length; i++) p.lineTo(points[i][0], points[i][1])
  return p
}

const linePathCache = new WeakMap<StrokeItem, Path2D>()

export function strokeLinePath(s: StrokeItem): Path2D {
  let p = linePathCache.get(s)
  if (!p) {
    p = linePath(s.points)
    linePathCache.set(s, p)
  }
  return p
}

/** Dash pattern in board units for a line of width `size`. */
export function dashPattern(dash: LineDash | undefined, size: number): number[] {
  if (dash === 'dashed') return [size * 3 + 5, size * 2 + 5]
  if (dash === 'dotted') return [0.001, size * 2 + 3]
  return []
}

export function strokeLine(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  size: number,
  tool: InkStyle['tool'],
  dash?: LineDash
): void {
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = inkColor(color)
  ctx.setLineDash(dashPattern(dash, size))
  if (tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.globalCompositeOperation = highlightBlend()
    ctx.stroke(path)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.stroke(path)
  }
  ctx.setLineDash([])
}

/** Direction at one end of a polyline: unit vector pointing outwards, from a point a little way back. */
function endDirection(points: readonly Point[], atEnd: boolean, minDist: number): [number, number] | null {
  if (points.length < 2) return null
  const n = points.length
  const tip = atEnd ? points[n - 1] : points[0]
  for (let i = 1; i < n; i++) {
    const q = atEnd ? points[n - 1 - i] : points[i]
    const dx = tip[0] - q[0]
    const dy = tip[1] - q[1]
    const d = Math.hypot(dx, dy)
    if (d >= minDist || i === n - 1) return d > 0 ? [dx / d, dy / d] : null
  }
  return null
}

export interface CapGeometry {
  kind: LineCap
  x: number
  y: number
  /** Outward unit direction. */
  ux: number
  uy: number
  len: number
}

/** Geometry of the start/end decorations of a stroke. */
export function capGeometry(s: Pick<StrokeItem, 'points' | 'size' | 'startCap' | 'endCap'>): CapGeometry[] {
  const out: CapGeometry[] = []
  const len = Math.max(10, s.size * 4.5)
  for (const [cap, atEnd] of [
    [s.startCap, false],
    [s.endCap, true]
  ] as const) {
    if (!cap) continue
    const dir = endDirection(s.points, atEnd, len)
    if (!dir) continue
    const tip = atEnd ? s.points[s.points.length - 1] : s.points[0]
    out.push({ kind: cap, x: tip[0], y: tip[1], ux: dir[0], uy: dir[1], len })
  }
  return out
}

export function drawCaps(ctx: CanvasRenderingContext2D, s: Pick<StrokeItem, 'points' | 'size' | 'startCap' | 'endCap' | 'color'>): void {
  const color = inkColor(s.color)
  for (const c of capGeometry(s)) {
    const px = -c.uy
    const py = c.ux
    ctx.beginPath()
    if (c.kind === 'arrow') {
      ctx.moveTo(c.x + c.ux * s.size * 0.6, c.y + c.uy * s.size * 0.6)
      ctx.lineTo(c.x - c.ux * c.len + px * c.len * 0.5, c.y - c.uy * c.len + py * c.len * 0.5)
      ctx.lineTo(c.x - c.ux * c.len - px * c.len * 0.5, c.y - c.uy * c.len - py * c.len * 0.5)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
    } else if (c.kind === 'dot') {
      ctx.arc(c.x, c.y, Math.max(3, s.size * 1.6), 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    } else if (c.kind === 'circle') {
      ctx.arc(c.x, c.y, Math.max(4, s.size * 2), 0, Math.PI * 2)
      ctx.fillStyle = inkPaper()
      ctx.fill()
      ctx.lineWidth = Math.max(1, s.size * 0.8)
      ctx.strokeStyle = color
      ctx.stroke()
    } else {
      const h = c.len * 0.5
      ctx.moveTo(c.x + px * h, c.y + py * h)
      ctx.lineTo(c.x - px * h, c.y - py * h)
      ctx.lineWidth = s.size
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      ctx.stroke()
    }
  }
}

/** Freehand ink with a dash pattern is drawn along its centre line (dashes can't be filled outlines). */
export const usesLineRender = (s: Pick<StrokeItem, 'geom' | 'dash'>): boolean => s.geom === 'line' || !!s.dash

/** Draw any stroke item the way it's stored (freehand outline or exact polyline + decorations). */
export function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeItem): void {
  if (usesLineRender(s)) strokeLine(ctx, strokeLinePath(s), s.color, s.size, s.tool, s.dash)
  else fillInk(ctx, strokePath(s), s.color, s.tool)
  if (s.startCap || s.endCap) drawCaps(ctx, s)
}

const r2s = (v: number): string => (Math.round(v * 100) / 100).toString()

/** SVG for the start/end decorations of a stroke. */
export function capsSvg(s: StrokeItem): string {
  const color = inkColor(s.color)
  return capGeometry(s)
    .map((c) => {
      const px = -c.uy
      const py = c.ux
      if (c.kind === 'arrow') {
        const pts = [
          [c.x + c.ux * s.size * 0.6, c.y + c.uy * s.size * 0.6],
          [c.x - c.ux * c.len + px * c.len * 0.5, c.y - c.uy * c.len + py * c.len * 0.5],
          [c.x - c.ux * c.len - px * c.len * 0.5, c.y - c.uy * c.len - py * c.len * 0.5]
        ]
        return `<path d="M${pts.map(([x, y]) => `${r2s(x)},${r2s(y)}`).join('L')}Z" fill="${color}"/>`
      }
      if (c.kind === 'dot') return `<circle cx="${r2s(c.x)}" cy="${r2s(c.y)}" r="${r2s(Math.max(3, s.size * 1.6))}" fill="${color}"/>`
      if (c.kind === 'circle')
        return `<circle cx="${r2s(c.x)}" cy="${r2s(c.y)}" r="${r2s(Math.max(4, s.size * 2))}" fill="${inkPaper()}" stroke="${color}" stroke-width="${r2s(Math.max(1, s.size * 0.8))}"/>`
      const h = c.len * 0.5
      return `<line x1="${r2s(c.x + px * h)}" y1="${r2s(c.y + py * h)}" x2="${r2s(c.x - px * h)}" y2="${r2s(c.y - py * h)}" stroke="${color}" stroke-width="${r2s(s.size)}" stroke-linecap="round"/>`
    })
    .join('')
}

export function lineSvgPath(points: readonly Point[]): string {
  const f = (v: number): string => (Math.round(v * 100) / 100).toString()
  if (points.length === 1) return `M${f(points[0][0])},${f(points[0][1])}l0.01,0`
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('')
}
