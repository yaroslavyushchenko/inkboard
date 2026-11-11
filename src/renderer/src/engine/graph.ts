import type { BBox, GraphItem, GraphParams } from './types'

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
// Axes only — the board's own paper (dots / grid) is the grid.
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
  texts: { x: number; y: number; s: string; size: number; align: Align; baseline: Baseline; italic?: boolean; color: string }[]
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
    grid: false
  }
}

export function graphPrims(g: GraphItem): GraphPrims {
  const u = g.unit
  const X = (x: number): number => g.ox + x * u
  const Y = (y: number): number => g.oy - y * u
  const axisW = Math.max(u * 0.075, 0.8)
  const tick = u * 0.2
  const font = u * 0.5
  const ext = u * 0.75 // axis continues past the last unit to the arrow tip
  const head = u * 0.42
  const out: GraphPrims = { lines: [], tris: [], texts: [] }
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

const fontFamily = (italic?: boolean): string => (italic ? '"Times New Roman", Georgia, serif' : 'system-ui, "Segoe UI", Ubuntu, sans-serif')

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
  for (const t of p.texts) {
    ctx.font = `${t.italic ? 'italic ' : ''}${t.size}px ${fontFamily(t.italic)}`
    ctx.textAlign = t.align
    ctx.textBaseline = t.baseline
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
  for (const t of p.texts) {
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'
    const base = t.baseline === 'top' ? 'hanging' : t.baseline === 'middle' ? 'central' : 'alphabetic'
    parts.push(
      `<text x="${r2(t.x)}" y="${r2(t.y)}" font-size="${r2(t.size)}" font-family='${fontFamily(t.italic)}'${t.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${base}" fill="${t.color}">${t.s}</text>`
    )
  }
  parts.push('</g>')
  return parts.join('')
}
