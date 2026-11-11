import { getStroke, type StrokeOptions } from 'perfect-freehand'
import type { Point, StrokeItem } from './types'

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

/** SVG path data of a stroke's filled outline (same geometry as on screen) — for vector export. */
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
  ctx.fillStyle = color
  if (tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.globalCompositeOperation = 'multiply'
    ctx.fill(path)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.fill(path)
  }
}
