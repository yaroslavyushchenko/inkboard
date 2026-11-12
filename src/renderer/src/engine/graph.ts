import { PAPER_COLOR } from './background'
import { MAX_EXPR_LENGTH, parseExpr, type MathFn } from './mathexpr'
import { MATH_FONT, typesetFormula } from './mathtype'
import type { BBox, GraphItem, GraphParams, PlotFn } from './types'

/** At most this many functions on one plane. */
export const MAX_FNS = 8
/** Colours given to new functions in turn (from the pen palette). */
export const FN_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#6741d9', '#f76707', '#c2255c']

/** Ready-made coordinate templates for school. `unit` 24 = one dot-paper cell. */
export interface GraphPreset {
  id: string
  /** i18n key for built-ins, or a user-given name. */
  name: string
  builtin?: boolean
  params: GraphParams
}

const line = (xMin: number, xMax: number, unit = 36, labelStep = 1): GraphParams => ({
  kind: 'line', xMin, xMax, yMin: 0, yMax: 0, unit, labelStep, grid: false
})
// Axes only; the board's own paper (dots / grid) is the grid.
const plane = (xMin: number, xMax: number, yMin: number, yMax: number, unit = 24, labelStep = 1): GraphParams => ({
  kind: 'plane', xMin, xMax, yMin, yMax, unit, labelStep, grid: false
})

/** 3D axes. x is drawn towards the viewer (down-left, half length), so with unit 48 its steps land on paper dots. */
const space = (max: number, unit = 48, labelStep = 1): GraphParams => ({
  kind: 'space', xMin: 0, xMax: max, yMin: 0, yMax: max, zMin: 0, zMax: max, unit, labelStep, grid: false
})

export const BUILTIN_GRAPHS: GraphPreset[] = [
  { id: 'line-10', name: 'graph.preset.line10', builtin: true, params: line(-10, 10) },
  { id: 'line-5', name: 'graph.preset.line5', builtin: true, params: line(-5, 5, 48) },
  { id: 'line-0-20', name: 'graph.preset.line020', builtin: true, params: line(0, 20) },
  { id: 'plane-10', name: 'graph.preset.plane10', builtin: true, params: plane(-10, 10, -10, 10) },
  { id: 'plane-5', name: 'graph.preset.plane5', builtin: true, params: plane(-5, 5, -5, 5, 48) },
  { id: 'quad-1', name: 'graph.preset.quadrant', builtin: true, params: plane(0, 10, 0, 10, 48) },
  { id: 'space-5', name: 'graph.preset.space5', builtin: true, params: space(5) },
  { id: 'space-3', name: 'graph.preset.space3', builtin: true, params: space(3, 72) }
]

const LABEL_COLOR = '#3b3d43'

type Align = 'left' | 'center' | 'right'
type Baseline = 'top' | 'middle' | 'alphabetic'

/** Drawing primitives in board coordinates, consumed by the canvas renderer and the SVG exporter. */
export interface GraphPrims {
  lines: { x1: number; y1: number; x2: number; y2: number; w: number; color: string }[]
  tris: { pts: [number, number][]; color: string }[]
  texts: {
    x: number
    y: number
    s: string
    size: number
    align: Align
    baseline: Baseline
    italic?: boolean
    color: string
    /** Formula text: serif math font, outlined in paper colour so it stays readable over curves. */
    math?: boolean
  }[]
  /** Plotted function curves (polylines). */
  paths: { pts: [number, number][]; w: number; color: string }[]
  /** Strokes of the formulas (fraction bars, radical signs), drawn over the curves. */
  marks: { pts: [number, number][]; w: number; color: string }[]
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

/** Normalise user input (swapped ranges, zero steps…). */
export function sanitizeGraph(p: GraphParams): GraphParams {
  const xMin = Math.round(Math.min(p.xMin, p.xMax))
  const xMax = Math.round(Math.max(p.xMin, p.xMax))
  const yMin = Math.round(Math.min(p.yMin, p.yMax))
  const yMax = Math.round(Math.max(p.yMin, p.yMax))
  const kind = p.kind === 'plane' || p.kind === 'space' ? p.kind : 'line'
  const zA = Math.round(Number(p.zMin ?? 0) || 0)
  const zB = Math.round(Number(p.zMax ?? Math.max(1, yMax)) || 0)
  const z = kind === 'space' ? { zMin: Math.min(zA, zB), zMax: Math.max(zA, zB) === Math.min(zA, zB) ? Math.min(zA, zB) + 1 : Math.max(zA, zB) } : {}
  return {
    kind,
    ...z,
    xMin,
    xMax: xMax === xMin ? xMin + 1 : xMax,
    yMin,
    yMax: kind !== 'line' && yMax === yMin ? yMin + 1 : yMax,
    unit: clamp(Number(p.unit) || 24, 6, 400),
    labelStep: Math.max(1, Math.round(Number(p.labelStep) || 1)),
    // Grid lines were dropped by design: the paper background provides them.
    grid: false,
    ...sanitizeFns(p.fns),
    ...(p.hideFormulas === true ? { hideFormulas: true } : {})
  }
}

/** Keep only well-formed functions (non-empty text within the length cap); fix missing colours. */
function sanitizeFns(v: unknown): { fns?: PlotFn[] } {
  if (!Array.isArray(v)) return {}
  const fns: PlotFn[] = []
  for (const f of v as Partial<PlotFn>[]) {
    if (!f || typeof f.expr !== 'string') continue
    const expr = f.expr.trim()
    if (!expr || expr.length > MAX_EXPR_LENGTH) continue
    const color = typeof f.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(f.color) ? f.color : FN_COLORS[fns.length % FN_COLORS.length]
    fns.push({ expr, color })
    if (fns.length === MAX_FNS) break
  }
  return fns.length ? { fns } : {}
}

/** A row of the function panel. */
export interface FnRow {
  key: number
  expr: string
  color: string
  /** Last text of this row that parsed; drawn while `expr` is half-typed (`x^`, `sin(`). */
  shown: string
}

/** Refresh `shown` for every row and list the functions to draw (rows with nothing valid yet are skipped). */
export function liveFns(rows: FnRow[]): { rows: FnRow[]; fns: PlotFn[] } {
  const next = rows.map((r) => {
    if (!r.expr.trim()) return r.shown ? { ...r, shown: '' } : r
    const ok = parseExpr(r.expr).ok
    return ok && r.shown !== r.expr ? { ...r, shown: r.expr } : r
  })
  return { rows: next, fns: next.filter((r) => r.shown.trim()).map((r) => ({ expr: r.shown, color: r.color })) }
}

/**
 * Sample y = f(x) for x in [x0, x1] and clip it to the box [x0, x1] × [y0, y1] (all in axis units).
 * Returns separate polylines: the curve is broken where f is undefined (sqrt(x) for x < 0) and across
 * jumps that do not shrink when the step is refined (asymptotes of 1/x or tan(x)).
 * `step` is the base sampling distance; steep parts are refined adaptively.
 */
export function plotCurve(f: MathFn, x0: number, x1: number, y0: number, y1: number, step: number): [number, number][][] {
  const flat = (y1 - y0) * 0.01 // a jump smaller than this needs no refining
  const MAX_DEPTH = 14
  let budget = 60000 // evaluations; keeps wild functions like sin(1/x) from stalling the board
  const val = (x: number): number => {
    budget--
    const v = f(x)
    return Number.isFinite(v) ? v : NaN
  }
  /** Points with `null` marking a break. */
  const raw: ([number, number] | null)[] = []
  const emit = (x: number, y: number): void => {
    raw.push([x, y])
  }
  const brk = (): void => {
    if (raw.length && raw[raw.length - 1] !== null) raw.push(null)
  }
  // Both ends finite: add the points after `a` up to and including `b`.
  const refine = (a: number, fa: number, b: number, fb: number, d: number): void => {
    if (Math.abs(fb - fa) <= flat || (fa > y1 && fb > y1) || (fa < y0 && fb < y0) || budget <= 0) {
      emit(b, fb)
      return
    }
    if (d === 0) {
      // Still a big jump over a tiny interval: a discontinuity, don't connect.
      brk()
      emit(b, fb)
      return
    }
    const m = (a + b) / 2
    const fm = val(m)
    between(a, fa, m, fm, d - 1)
    between(m, fm, b, fb, d - 1)
  }
  const between = (a: number, fa: number, b: number, fb: number, d: number): void => {
    const okA = !Number.isNaN(fa)
    const okB = !Number.isNaN(fb)
    if (okA && okB) return refine(a, fa, b, fb, d)
    if (!okA && !okB) return brk()
    // Domain edge between a and b: find it so sqrt(x) starts exactly at 0.
    let g = okA ? a : b // defined side
    let h = okA ? b : a
    let fg = okA ? fa : fb
    for (let i = 0; i < 40; i++) {
      const m = (g + h) / 2
      const fm = val(m)
      if (Number.isNaN(fm)) h = m
      else {
        g = m
        fg = fm
      }
    }
    if (okA) {
      if (g !== a) refine(a, fa, g, fg, d)
      brk()
    } else {
      brk()
      emit(g, fg)
      if (g !== b) refine(g, fg, b, fb, d)
    }
  }
  const n = Math.min(4000, Math.max(8, Math.ceil((x1 - x0) / step)))
  let px = x0
  let py = val(x0)
  if (!Number.isNaN(py)) emit(px, py)
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = val(x)
    between(px, py, x, y, MAX_DEPTH)
    px = x
    py = y
  }

  // Clip every segment to the box (Liang-Barsky) and join the pieces back into polylines.
  const out: [number, number][][] = []
  let cur: [number, number][] | null = null
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i - 1]
    const q = raw[i]
    if (!p || !q) {
      cur = null
      continue
    }
    const c = clipSegment(p, q, x0, x1, y0, y1)
    if (!c) {
      cur = null
      continue
    }
    const last = cur?.[cur.length - 1]
    if (!cur || !last || last[0] !== c[0][0] || last[1] !== c[0][1]) {
      cur = [c[0]]
      out.push(cur)
    }
    cur.push(c[1])
  }
  return out
}

function clipSegment(p: [number, number], q: [number, number], x0: number, x1: number, y0: number, y1: number): [[number, number], [number, number]] | null {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, p[0] - x0],
    [dx, x1 - p[0]],
    [-dy, p[1] - y0],
    [dy, y1 - p[1]]
  ]
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return null
      continue
    }
    const r = qq / pp
    if (pp < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  const a: [number, number] = t0 === 0 ? p : [p[0] + dx * t0, p[1] + dy * t0]
  const b: [number, number] = t1 === 1 ? q : [p[0] + dx * t1, p[1] + dy * t1]
  return [a, b]
}

/** Board-space curves of the plane's functions and their formulas (unparsable ones draw nothing). */
function addFnPrims(g: GraphItem, out: GraphPrims): void {
  if (g.kind !== 'plane' || !g.fns?.length) return
  const u = g.unit
  const w = Math.max(u * 0.1, 1.2)
  const X = (x: number): number => g.ox + x * u
  const Y = (y: number): number => g.oy - y * u
  const labels: Label[] = []
  for (const f of g.fns) {
    const r = parseExpr(f.expr)
    if (!r.ok) continue
    // Sample about every 2 board units (in axis units: 2 / unit).
    const pieces = plotCurve(r.fn, g.xMin, g.xMax, g.yMin, g.yMax, 2 / u).filter((p) => p.length >= 2)
    for (const piece of pieces) out.paths.push({ color: f.color, w, pts: piece.map(([x, y]) => [X(x), Y(y)]) })
    if (g.hideFormulas || !pieces.length) continue
    // Anchor the formula at the right end of the curve, where it leaves the plane or the x range ends.
    let end = pieces[0][pieces[0].length - 1]
    for (const p of pieces) if (p[p.length - 1][0] > end[0]) end = p[p.length - 1]
    labels.push({ color: f.color, box: typesetFormula(r.node, u * 0.62, r.comma), ax: X(end[0]), ay: Y(end[1]), x: 0, y: 0 })
  }
  placeLabels(labels, { minX: X(g.xMin), maxX: X(g.xMax), minY: Y(g.yMax), maxY: Y(g.yMin) }, u)
  for (const l of labels) {
    for (const ln of l.box.lines) out.marks.push({ color: l.color, w: ln.w, pts: ln.pts.map(([x, y]) => [x + l.x, y + l.y]) })
    for (const t of l.box.texts) {
      out.texts.push({ x: t.x + l.x, y: t.y + l.y, s: t.s, size: t.size, italic: t.italic, align: 'left', baseline: 'alphabetic', color: l.color, math: true })
    }
  }
}

export interface Label {
  color: string
  box: ReturnType<typeof typesetFormula>
  /** Curve end the label belongs to. */
  ax: number
  ay: number
  /** Placed baseline start. */
  x: number
  y: number
}

/**
 * Put each formula just above and right of its curve's end, pulled inside the plane, then push apart
 * labels that would overlap (in order from top to bottom).
 */
export function placeLabels(labels: Label[], box: BBox, u: number): void {
  const gap = u * 0.25
  for (const l of labels) {
    const b = l.box
    l.x = Math.min(l.ax + gap, box.maxX - b.w)
    l.y = l.ay - gap - b.desc
    // Ran into the top edge (the curve leaves the plane upwards): go below the end instead.
    if (l.y - b.asc < box.minY) l.y = l.ay + gap + b.asc
    l.x = Math.max(box.minX, l.x)
    l.y = clamp(l.y, box.minY + b.asc, box.maxY - b.desc)
  }
  const top = (l: Label): number => l.y - l.box.asc
  const bottom = (l: Label): number => l.y + l.box.desc
  const sorted = [...labels].sort((a, b) => top(a) - top(b))
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i]
    for (let j = 0; j < i; j++) {
      const o = sorted[j]
      const overlapX = l.x < o.x + o.box.w && o.x < l.x + l.box.w
      if (overlapX && top(l) < bottom(o) + gap * 0.4 && top(o) < bottom(l) + gap * 0.4) {
        l.y = bottom(o) + gap * 0.4 + l.box.asc
      }
    }
    // Pushed out at the bottom: stack upwards from the plane's bottom edge instead.
    if (bottom(l) > box.maxY) l.y = box.maxY - l.box.desc
  }
}

const primsCache = new WeakMap<GraphItem, GraphPrims>()

/** Items are immutable (edits replace them), so prims are cached per item object. */
export function graphPrims(g: GraphItem): GraphPrims {
  let p = primsCache.get(g)
  if (!p) {
    p = buildPrims(g)
    addFnPrims(g, p)
    primsCache.set(g, p)
  }
  return p
}

function buildPrims(g: GraphItem): GraphPrims {
  const u = g.unit
  const X = (x: number): number => g.ox + x * u
  const Y = (y: number): number => g.oy - y * u
  const axisW = Math.max(u * 0.075, 0.8)
  const tick = u * 0.2
  const font = u * 0.5
  const ext = u * 0.75 // axis continues past the last unit to the arrow tip
  const head = u * 0.42
  const out: GraphPrims = { lines: [], tris: [], texts: [], paths: [], marks: [] }
  const label = (n: number): string => (n < 0 ? `−${-n}` : `${n}`)
  const arrow = (tipX: number, tipY: number, dx: number, dy: number): void => {
    out.tris.push({
      color: g.color,
      pts: [
        [tipX, tipY],
        [tipX - dx * head - dy * head * 0.45, tipY - dy * head + dx * head * 0.45],
        [tipX - dx * head + dy * head * 0.45, tipY - dy * head - dx * head * 0.45]
      ]
    })
  }

  if (g.kind === 'line') {
    const y = g.oy
    out.lines.push({ x1: X(g.xMin) - u * 0.3, y1: y, x2: X(g.xMax) + ext, y2: y, w: axisW, color: g.color })
    arrow(X(g.xMax) + ext, y, 1, 0)
    for (let x = g.xMin; x <= g.xMax; x++) {
      out.lines.push({ x1: X(x), y1: y - tick, x2: X(x), y2: y + tick, w: axisW * 0.8, color: g.color })
      if (x % g.labelStep === 0) out.texts.push({ x: X(x), y: y + tick + u * 0.15, s: label(x), size: font, align: 'center', baseline: 'top', color: LABEL_COLOR })
    }
    out.texts.push({ x: X(g.xMax) + ext, y: y + tick + u * 0.15, s: 'x', size: font * 1.15, align: 'center', baseline: 'top', italic: true, color: LABEL_COLOR })
    return out
  }

  if (g.kind === 'space') return spacePrims(g, out, { axisW, tick, font, ext, head })

  // Coordinate plane. Axes sit at 0, or at the nearest edge if 0 is outside the range.
  const ax = clamp(0, g.xMin, g.xMax)
  const ay = clamp(0, g.yMin, g.yMax)
  // x axis
  out.lines.push({ x1: X(g.xMin), y1: Y(ay), x2: X(g.xMax) + ext, y2: Y(ay), w: axisW, color: g.color })
  arrow(X(g.xMax) + ext, Y(ay), 1, 0)
  // y axis
  out.lines.push({ x1: X(ax), y1: Y(g.yMin), x2: X(ax), y2: Y(g.yMax) - ext, w: axisW, color: g.color })
  arrow(X(ax), Y(g.yMax) - ext, 0, -1)

  for (let x = g.xMin; x <= g.xMax; x++) {
    if (x === ax) continue
    out.lines.push({ x1: X(x), y1: Y(ay) - tick, x2: X(x), y2: Y(ay) + tick, w: axisW * 0.8, color: g.color })
    if (x % g.labelStep === 0) out.texts.push({ x: X(x), y: Y(ay) + tick + u * 0.12, s: label(x), size: font, align: 'center', baseline: 'top', color: LABEL_COLOR })
  }
  for (let y = g.yMin; y <= g.yMax; y++) {
    if (y === ay) continue
    out.lines.push({ x1: X(ax) - tick, y1: Y(y), x2: X(ax) + tick, y2: Y(y), w: axisW * 0.8, color: g.color })
    if (y % g.labelStep === 0) out.texts.push({ x: X(ax) - tick - u * 0.15, y: Y(y), s: label(y), size: font, align: 'right', baseline: 'middle', color: LABEL_COLOR })
  }
  if (ax === 0 && ay === 0) {
    out.texts.push({ x: X(0) - u * 0.2, y: Y(0) + u * 0.12, s: '0', size: font, align: 'right', baseline: 'top', color: LABEL_COLOR })
  }
  out.texts.push({ x: X(g.xMax) + ext, y: Y(ay) + tick + u * 0.12, s: 'x', size: font * 1.15, align: 'center', baseline: 'top', italic: true, color: LABEL_COLOR })
  out.texts.push({ x: X(ax) - tick - u * 0.25, y: Y(g.yMax) - ext, s: 'y', size: font * 1.15, align: 'right', baseline: 'middle', italic: true, color: LABEL_COLOR })
  return out
}

/** Screen-plane position of the 3D point (x, y, z): y right, z up, x towards the viewer (down-left). */
function project(g: Pick<GraphItem, 'ox' | 'oy' | 'unit'>, x: number, y: number, z: number): [number, number] {
  const u = g.unit
  return [g.ox + y * u - x * u * 0.5, g.oy - z * u + x * u * 0.5]
}

function spacePrims(
  g: GraphItem,
  out: GraphPrims,
  m: { axisW: number; tick: number; font: number; ext: number; head: number }
): GraphPrims {
  const u = g.unit
  const label = (n: number): string => (n < 0 ? `−${-n}` : `${n}`)
  const zMin = g.zMin ?? 0
  const zMax = g.zMax ?? 5
  const axes: { name: string; min: number; max: number; at: (t: number) => [number, number]; side: [number, number] }[] = [
    // `side`: direction (screen) in which ticks stick out and numbers sit.
    { name: 'x', min: g.xMin, max: g.xMax, at: (t) => project(g, t, 0, 0), side: [1, 1] },
    { name: 'y', min: g.yMin, max: g.yMax, at: (t) => project(g, 0, t, 0), side: [0, 1] },
    { name: 'z', min: zMin, max: zMax, at: (t) => project(g, 0, 0, t), side: [-1, 0] }
  ]
  for (const a of axes) {
    const [x0, y0] = a.at(Math.min(a.min, 0) - (a.min >= 0 ? 0.4 : 0))
    const [x1, y1] = a.at(a.max)
    const len = Math.hypot(x1 - x0, y1 - y0) || 1
    const dx = (x1 - x0) / len
    const dy = (y1 - y0) / len
    const tipX = x1 + dx * m.ext
    const tipY = y1 + dy * m.ext
    out.lines.push({ x1: x0, y1: y0, x2: tipX, y2: tipY, w: m.axisW, color: g.color })
    out.tris.push({
      color: g.color,
      pts: [
        [tipX, tipY],
        [tipX - dx * m.head - dy * m.head * 0.45, tipY - dy * m.head + dx * m.head * 0.45],
        [tipX - dx * m.head + dy * m.head * 0.45, tipY - dy * m.head - dx * m.head * 0.45]
      ]
    })
    // Ticks perpendicular to the axis, numbers on the `side`.
    const sl = Math.hypot(a.side[0], a.side[1]) || 1
    const sx = a.side[0] / sl
    const sy = a.side[1] / sl
    const px = -dy
    const py = dx
    for (let t = a.min; t <= a.max; t++) {
      if (t === 0) continue
      const [x, y] = a.at(t)
      out.lines.push({ x1: x - px * m.tick, y1: y - py * m.tick, x2: x + px * m.tick, y2: y + py * m.tick, w: m.axisW * 0.8, color: g.color })
      if (t % g.labelStep === 0) {
        const off = m.tick + u * 0.28
        out.texts.push({
          x: x + sx * off,
          y: y + sy * off,
          s: label(t),
          size: m.font,
          align: sx > 0.3 ? 'left' : sx < -0.3 ? 'right' : 'center',
          baseline: sy > 0.3 ? 'top' : 'middle',
          color: LABEL_COLOR
        })
      }
    }
    // Axis name next to the arrow tip.
    const nx = tipX + sx * u * 0.45
    const ny = tipY + sy * u * 0.45
    out.texts.push({ x: nx, y: ny, s: a.name, size: m.font * 1.15, align: sx > 0.3 ? 'left' : sx < -0.3 ? 'right' : 'center', baseline: 'middle', italic: true, color: LABEL_COLOR })
  }
  const [ox, oy] = project(g, 0, 0, 0)
  out.texts.push({ x: ox - u * 0.2, y: oy - u * 0.05, s: 'O', size: m.font, align: 'right', baseline: 'alphabetic', italic: true, color: LABEL_COLOR })
  return out
}

export function graphBBox(g: Pick<GraphItem, keyof GraphParams | 'ox' | 'oy'>): BBox {
  const u = g.unit
  const pad = u * 1.3
  if (g.kind === 'space') {
    const pts = [
      project(g, Math.min(g.xMin, 0) - 0.4, 0, 0),
      project(g, g.xMax, 0, 0),
      project(g, 0, Math.min(g.yMin, 0) - 0.4, 0),
      project(g, 0, g.yMax, 0),
      project(g, 0, 0, Math.min(g.zMin ?? 0, 0) - 0.4),
      project(g, 0, 0, g.zMax ?? 5)
    ]
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad }
  }
  if (g.kind === 'line') {
    return { minX: g.ox + g.xMin * u - pad, minY: g.oy - pad, maxX: g.ox + g.xMax * u + pad, maxY: g.oy + pad }
  }
  return {
    minX: g.ox + g.xMin * u - pad,
    minY: g.oy - g.yMax * u - pad,
    maxX: g.ox + g.xMax * u + pad,
    maxY: g.oy - g.yMin * u + pad
  }
}

const fontFamily = (italic?: boolean, math?: boolean): string =>
  math ? MATH_FONT : italic ? '"Times New Roman", Georgia, serif' : 'system-ui, "Segoe UI", Ubuntu, sans-serif'
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function drawGraph(ctx: CanvasRenderingContext2D, g: GraphItem): void {
  const p = graphPrims(g)
  ctx.lineCap = 'round'
  for (const l of p.lines) {
    ctx.beginPath()
    ctx.moveTo(l.x1, l.y1)
    ctx.lineTo(l.x2, l.y2)
    ctx.lineWidth = l.w
    ctx.strokeStyle = l.color
    ctx.stroke()
  }
  for (const t of p.tris) {
    ctx.beginPath()
    ctx.moveTo(...t.pts[0])
    ctx.lineTo(...t.pts[1])
    ctx.lineTo(...t.pts[2])
    ctx.closePath()
    ctx.fillStyle = t.color
    ctx.fill()
  }
  ctx.lineJoin = 'round'
  const polyline = (l: GraphPrims['paths'][number]): void => {
    ctx.beginPath()
    ctx.moveTo(l.pts[0][0], l.pts[0][1])
    for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i][0], l.pts[i][1])
    ctx.lineWidth = l.w
    ctx.strokeStyle = l.color
    ctx.stroke()
  }
  for (const l of p.paths) polyline(l)
  const font = (t: GraphPrims['texts'][number]): void => {
    ctx.font = `${t.italic ? 'italic ' : ''}${t.size}px ${fontFamily(t.italic, t.math)}`
    ctx.textAlign = t.align
    ctx.textBaseline = t.baseline
  }
  // Paper-coloured outline under formula glyphs keeps them readable where curves cross.
  ctx.strokeStyle = PAPER_COLOR
  for (const t of p.texts) {
    if (!t.math) continue
    font(t)
    ctx.lineWidth = t.size * 0.22
    ctx.strokeText(t.s, t.x, t.y)
  }
  for (const l of p.marks) polyline(l)
  for (const t of p.texts) {
    font(t)
    ctx.fillStyle = t.color
    ctx.fillText(t.s, t.x, t.y)
  }
}

const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()

export function graphSvg(g: GraphItem): string {
  const p = graphPrims(g)
  const parts: string[] = ['<g stroke-linecap="round">']
  for (const l of p.lines) {
    parts.push(`<line x1="${r2(l.x1)}" y1="${r2(l.y1)}" x2="${r2(l.x2)}" y2="${r2(l.y2)}" stroke="${l.color}" stroke-width="${r2(l.w)}"/>`)
  }
  for (const t of p.tris) parts.push(`<path d="M${t.pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L')}Z" fill="${t.color}"/>`)
  for (const l of p.paths) {
    parts.push(`<path d="M${l.pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L')}" fill="none" stroke="${l.color}" stroke-width="${r2(l.w)}" stroke-linejoin="round"/>`)
  }
  for (const t of p.texts) {
    if (!t.math) continue
    parts.push(
      `<text x="${r2(t.x)}" y="${r2(t.y)}" font-size="${r2(t.size)}" font-family='${MATH_FONT}'${t.italic ? ' font-style="italic"' : ''} fill="none" stroke="${PAPER_COLOR}" stroke-width="${r2(t.size * 0.22)}" stroke-linejoin="round">${esc(t.s)}</text>`
    )
  }
  for (const l of p.marks) {
    parts.push(`<path d="M${l.pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L')}" fill="none" stroke="${l.color}" stroke-width="${r2(l.w)}" stroke-linejoin="round"/>`)
  }
  for (const t of p.texts) {
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'
    const base = t.baseline === 'top' ? 'hanging' : t.baseline === 'middle' ? 'central' : 'alphabetic'
    parts.push(
      `<text x="${r2(t.x)}" y="${r2(t.y)}" font-size="${r2(t.size)}" font-family='${fontFamily(t.italic, t.math)}'${t.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${base}" fill="${t.color}">${esc(t.s)}</text>`
    )
  }
  parts.push('</g>')
  return parts.join('')
}
