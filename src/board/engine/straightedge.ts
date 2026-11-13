import { COMPASS_CELL } from './compass'
import { rgba } from './protractor'
import type { Camera, Point } from '@inkboard/core/types'

/**
 * Straight-edged drawing aids: the ruler and the set squares (45° and 30°/60°). Like the protractor
 * they are not board content: they live in world coordinates so they pan and zoom with the board.
 *
 * Local frame: origin at the centre of the shape, +u along its main edge (rotated by `rot`), +v down.
 * - drag the body: move it;
 * - drag the ↻ handle: turn it (Shift = 15° steps) and change its length (whole centimetres);
 * - draw with the pen along an edge: a straight line exactly along that edge, in whole millimetres.
 */
export type StraightKind = 'ruler' | 'square45' | 'square60'

export interface Straightedge {
  kind: StraightKind
  x: number
  y: number
  rot: number
  /** Length of the main edge (ruler length / horizontal leg of a set square), world units. */
  size: number
}

/** One centimetre on the board: two cells of the squared paper, as in a school exercise book. */
export const CM = COMPASS_CELL * 2
export const MM = CM / 10
/** Ruler width (3 paper cells), and where its scale starts (1 cell in from the left end). */
const RULER_W = CM * 1.5
const RULER_MARGIN = CM * 0.5
export const MIN_SIZE = CM * 3
export const MAX_SIZE = CM * 100

/** Screen-px distances used for handles and edge snapping. */
const HANDLE_OFFSET = 26
const HANDLE_R = 13
/** How far from an edge (outside / inside) a pen press still draws along it. */
const EDGE_OUT = 16
const EDGE_IN = 12

interface V {
  u: number
  v: number
}

export interface Edge {
  a: V
  b: V
  /** Outward unit normal: the side the pen draws on. */
  n: V
  /** Distance from `a` along the edge where its scale's zero is. */
  zero: number
  /** Has a centimetre scale. */
  scale: boolean
}

interface Geo {
  verts: V[]
  edges: Edge[]
  /** Window cut into a set square (decoration). */
  hole: V[] | null
  close: { at: V; dir: V }
  rotate: { at: V; dir: V }
}

const norm = (x: V): V => {
  const l = Math.hypot(x.u, x.v) || 1
  return { u: x.u / l, v: x.v / l }
}

/** Shape of an instrument in its local frame. */
export function geometry(s: Pick<Straightedge, 'kind' | 'size'>): Geo {
  const L = s.size
  if (s.kind === 'ruler') {
    const h = RULER_W / 2
    const tl = { u: -L / 2, v: -h }
    const tr = { u: L / 2, v: -h }
    const br = { u: L / 2, v: h }
    const bl = { u: -L / 2, v: h }
    return {
      verts: [tl, tr, br, bl],
      edges: [
        { a: tl, b: tr, n: { u: 0, v: -1 }, zero: RULER_MARGIN, scale: true },
        { a: bl, b: br, n: { u: 0, v: 1 }, zero: RULER_MARGIN, scale: false }
      ],
      hole: null,
      close: { at: { u: -L / 2, v: 0 }, dir: { u: -1, v: 0 } },
      rotate: { at: { u: L / 2, v: 0 }, dir: { u: 1, v: 0 } }
    }
  }
  // Right angle at the bottom left, the main leg to the right, the other leg up.
  const H = s.kind === 'square45' ? L : L / Math.sqrt(3)
  const cu = L / 3
  const cv = -H / 3
  const R = { u: -cu, v: -cv }
  const A = { u: L - cu, v: -cv }
  const B = { u: -cu, v: -H - cv }
  const hyp = norm({ u: H, v: -L })
  // Window: the same triangle, smaller, around the incentre.
  const c = Math.hypot(L, H)
  const inc = { u: (L * B.u + H * A.u + c * R.u) / (L + H + c), v: (L * B.v + H * A.v + c * R.v) / (L + H + c) }
  const k = 0.42
  const shrink = (p: V): V => ({ u: inc.u + (p.u - inc.u) * k, v: inc.v + (p.v - inc.v) * k })
  return {
    verts: [R, A, B],
    edges: [
      { a: R, b: A, n: { u: 0, v: 1 }, zero: 0, scale: true },
      { a: R, b: B, n: { u: -1, v: 0 }, zero: 0, scale: true },
      { a: A, b: B, n: hyp, zero: 0, scale: false }
    ],
    hole: [R, A, B].map(shrink),
    close: { at: B, dir: norm({ u: -1, v: -1 }) },
    rotate: { at: A, dir: norm({ u: 1, v: 1 }) }
  }
}

export function toLocal(s: Straightedge, wx: number, wy: number): V {
  const dx = wx - s.x
  const dy = wy - s.y
  const c = Math.cos(-s.rot)
  const n = Math.sin(-s.rot)
  return { u: dx * c - dy * n, v: dx * n + dy * c }
}

export function toWorld(s: Straightedge, u: number, v: number): { x: number; y: number } {
  const c = Math.cos(s.rot)
  const n = Math.sin(s.rot)
  return { x: s.x + u * c - v * n, y: s.y + u * n + v * c }
}

function handles(g: Geo, px: number): { close: V; rotate: V } {
  const at = (h: { at: V; dir: V }): V => ({ u: h.at.u + h.dir.u * HANDLE_OFFSET * px, v: h.at.v + h.dir.v * HANDLE_OFFSET * px })
  return { close: at(g.close), rotate: at(g.rotate) }
}

export type StraightHit = 'close' | 'rotate' | 'body' | `edge${number}`

/** Index of the edge in an `edgeN` hit, or null for the other parts. */
export function edgeOf(h: StraightHit | null): number | null {
  return h && h.startsWith('edge') ? Number(h.slice(4)) : null
}

function inside(p: V, poly: V[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.v > p.v !== b.v > p.v && p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v) + a.u) hit = !hit
  }
  return hit
}

export function hitStraightedge(s: Straightedge, wx: number, wy: number, zoom: number): StraightHit | null {
  const px = 1 / zoom
  const p = toLocal(s, wx, wy)
  const g = geometry(s)
  const H = handles(g, px)
  const near = (q: V): boolean => Math.hypot(p.u - q.u, p.v - q.v) <= (HANDLE_R + 4) * px
  if (near(H.close)) return 'close'
  if (near(H.rotate)) return 'rotate'
  let best: StraightHit | null = null
  let bestDist = Infinity
  for (let i = 0; i < g.edges.length; i++) {
    const e = g.edges[i]
    const len = Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
    const du = (e.b.u - e.a.u) / len
    const dv = (e.b.v - e.a.v) / len
    const along = (p.u - e.a.u) * du + (p.v - e.a.v) * dv
    const out = (p.u - e.a.u) * e.n.u + (p.v - e.a.v) * e.n.v
    if (along >= 0 && along <= len && out <= EDGE_OUT * px && out >= -EDGE_IN * px && Math.abs(out) < bestDist) {
      bestDist = Math.abs(out)
      best = `edge${i}`
    }
  }
  if (best) return best
  return inside(p, g.verts) ? 'body' : null
}

/** Length of an edge, world units. */
export function edgeLength(s: Straightedge, edge: number): number {
  const e = geometry(s).edges[edge]
  return Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
}

/**
 * Where a point falls along an edge, as a distance from the edge start, kept on the edge and snapped
 * to whole millimetres of the scale (unless `free`).
 */
export function edgePos(s: Straightedge, edge: number, wx: number, wy: number, free = false): number {
  const e = geometry(s).edges[edge]
  const len = Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
  const p = toLocal(s, wx, wy)
  let d = ((p.u - e.a.u) * (e.b.u - e.a.u) + (p.v - e.a.v) * (e.b.v - e.a.v)) / len
  if (!free) d = e.zero + Math.round((d - e.zero) / MM) * MM
  return Math.max(0, Math.min(len, d))
}

/** A straight line along an edge between two positions, `offset` outside it. */
export function edgeStroke(s: Straightedge, edge: number, d0: number, d1: number, offset: number): Point[] {
  const e = geometry(s).edges[edge]
  const len = Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
  const at = (d: number): Point => {
    const w = toWorld(s, e.a.u + ((e.b.u - e.a.u) * d) / len + e.n.u * offset, e.a.v + ((e.b.v - e.a.v) * d) / len + e.n.v * offset)
    return [w.x, w.y, 0.5]
  }
  return [at(d0), at(d1)]
}

/**
 * Turn and resize from the ↻ handle position: the handle follows the pointer. The length snaps to
 * whole centimetres; the angle to 15° steps with Shift, otherwise gently to horizontal / vertical.
 */
export function rotateFromHandle(s: Straightedge, wx: number, wy: number, zoom: number, shift: boolean): Straightedge {
  const unit = geometry({ kind: s.kind, size: 1 }).rotate
  const k = Math.hypot(unit.at.u, unit.at.v)
  const base = Math.atan2(unit.at.v + unit.dir.v * 1e-6, unit.at.u + unit.dir.u * 1e-6)
  const dist = Math.hypot(wx - s.x, wy - s.y) - HANDLE_OFFSET / zoom
  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(dist / k / CM) * CM))
  let rot = Math.atan2(wy - s.y, wx - s.x) - base
  const step = shift ? Math.PI / 12 : Math.PI / 2
  const snapped = Math.round(rot / step) * step
  if (shift || Math.abs(rot - snapped) < (3 * Math.PI) / 180) rot = snapped
  return { ...s, rot, size }
}

/**
 * Snap a ruler or set square to the paper grid (with Ctrl held): aligns the 0 mark on the ruler's
 * scale, or the 90° corner of a set square, to the nearest grid intersection.
 */
export function snapStraightedgeToGrid(s: Straightedge, stepX: number, stepY = stepX): Straightedge {
  const g = geometry(s)
  const anchor = s.kind === 'ruler' ? { u: -s.size / 2 + RULER_MARGIN, v: -RULER_W / 2 } : g.verts[0]
  const w = toWorld(s, anchor.u, anchor.v)
  const gx = Math.round(w.x / stepX) * stepX
  const gy = Math.round(w.y / stepY) * stepY
  return { ...s, x: s.x + gx - w.x, y: s.y + gy - w.y }
}

/** "5.3 cm" / "5,3 см": a length in centimetres with one decimal. */
export function cmText(len: number, unit: string, comma = false): string {
  const n = Math.round((len / CM) * 10) / 10
  const t = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return `${comma ? t.replace('.', ',') : t} ${unit}`
}

const ACCENT = '#4f6bed'

export interface StraightState {
  /** Part under the pointer (or in use): drawn lit. */
  hot: StraightHit | null
  /** Position under the pointer on the lit edge (distance from its start), shown as a marker. */
  mark: number | null
}

/** Draw a ruler / set square on the overlay canvas (`ctx` has an identity transform, device pixels). */
export function drawStraightedge(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  s: Straightedge,
  state: StraightState = { hot: null, mark: null }
): void {
  const z = cam.zoom * dpr
  ctx.save()
  ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z)
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rot)
  const px = 1 / cam.zoom
  const g = geometry(s)
  const hot = state.hot
  const glow = rgba(ACCENT, 0.22)
  const poly = (pts: V[]): void => {
    ctx.moveTo(pts[0].u, pts[0].v)
    for (const q of pts.slice(1)) ctx.lineTo(q.u, q.v)
    ctx.closePath()
  }

  // Body: translucent plastic, with the window of a set square left clear.
  ctx.beginPath()
  poly(g.verts)
  if (g.hole) poly(g.hole)
  ctx.fillStyle = rgba('#e8eeff', hot === 'body' ? 0.67 : 0.55)
  ctx.fill('evenodd')
  ctx.fillStyle = rgba(ACCENT, hot === 'body' ? 0.1 : 0.05)
  ctx.fill('evenodd')
  ctx.beginPath()
  poly(g.verts)
  ctx.lineWidth = (hot === 'body' ? 2.5 : 1.5) * px
  ctx.strokeStyle = ACCENT
  ctx.lineJoin = 'round'
  ctx.stroke()
  if (g.hole) {
    ctx.beginPath()
    poly(g.hole)
    ctx.lineWidth = 1 * px
    ctx.strokeStyle = rgba(ACCENT, 0.45)
    ctx.stroke()
    const degs = s.kind === 'square45' ? ['90°', '45°', '45°'] : ['90°', '30°', '60°']
    const aFont = Math.max(CM * 0.22, 9 * px)
    ctx.font = `600 ${aFont}px system-ui, sans-serif`
    ctx.fillStyle = rgba(ACCENT, 0.85)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const base = ctx.getTransform()
    for (let i = 0; i < 3; i++) {
      const hu = g.hole[i].u * 0.72 + g.verts[i].u * 0.28
      const hv = g.hole[i].v * 0.72 + g.verts[i].v * 0.28
      ctx.translate(hu, hv)
      ctx.rotate(-s.rot)
      ctx.fillText(degs[i], 0, 0)
      ctx.setTransform(base)
    }
  }

  // Lit edge: where a line can be drawn.
  const lit = edgeOf(hot)
  if (lit !== null) {
    const e = g.edges[lit]
    ctx.beginPath()
    ctx.moveTo(e.a.u, e.a.v)
    ctx.lineTo(e.b.u, e.b.v)
    ctx.lineWidth = 10 * px
    ctx.strokeStyle = glow
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(e.a.u, e.a.v)
    ctx.lineTo(e.b.u, e.b.v)
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
  }

  // Scales: millimetres, half centimetres and numbered centimetres, on the inside of the edge.
  const mmShown = MM * cam.zoom >= 3
  const halfShown = (CM / 2) * cam.zoom >= 3
  const numEvery = CM * cam.zoom >= 16 ? 1 : CM * cam.zoom >= 5 ? 5 : 10
  const font = Math.max(CM * 0.24, 9 * px)
  ctx.strokeStyle = 'rgba(40, 46, 70, 0.85)'
  ctx.fillStyle = '#23283c'
  ctx.font = `${font}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const e of g.edges) {
    if (!e.scale) continue
    const len = Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
    const du = (e.b.u - e.a.u) / len
    const dv = (e.b.v - e.a.v) / len
    const count = Math.floor((len - e.zero) / MM + 1e-6)
    for (const major of [false, true]) {
      ctx.beginPath()
      for (let i = 0; i <= count; i++) {
        const isCm = i % 10 === 0
        if (isCm !== major) continue
        const isHalf = i % 5 === 0
        if (!isCm && !(isHalf ? halfShown : mmShown)) continue
        const tl = isCm ? CM * 0.32 : isHalf ? CM * 0.22 : CM * 0.13
        const d = e.zero + i * MM
        const bu = e.a.u + du * d
        const bv = e.a.v + dv * d
        ctx.moveTo(bu, bv)
        ctx.lineTo(bu - e.n.u * tl, bv - e.n.v * tl)
      }
      ctx.lineWidth = (major ? 1.2 : 0.8) * px
      ctx.stroke()
    }
    // Numbers upright on screen, whichever way the instrument is turned.
    let ang = Math.atan2(dv, du)
    const screen = ang + s.rot
    const flip = Math.cos(screen) < -1e-6
    if (flip) ang += Math.PI
    const base = ctx.getTransform()
    for (let c = 0; c * 10 <= count; c++) {
      if (c % numEvery !== 0) continue
      // The number at the right angle of a set square would sit on the other leg's scale.
      if (c === 0 && !e.zero) continue
      const d = e.zero + c * CM
      const off = CM * 0.55
      ctx.translate(e.a.u + du * d - e.n.u * off, e.a.v + dv * d - e.n.v * off)
      ctx.rotate(ang)
      ctx.fillText(String(c), 0, 0)
      ctx.setTransform(base)
    }
  }

  // The position under the pointer on the lit edge.
  if (lit !== null && state.mark !== null) {
    const e = g.edges[lit]
    const len = Math.hypot(e.b.u - e.a.u, e.b.v - e.a.v)
    const mu = e.a.u + ((e.b.u - e.a.u) * state.mark) / len
    const mv = e.a.v + ((e.b.v - e.a.v) * state.mark) / len
    ctx.beginPath()
    ctx.moveTo(mu - e.n.u * CM * 0.45, mv - e.n.v * CM * 0.45)
    ctx.lineTo(mu + e.n.u * 6 * px, mv + e.n.v * 6 * px)
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(mu, mv, 3.5 * px, 0, Math.PI * 2)
    ctx.fillStyle = ACCENT
    ctx.fill()
  }

  // Handles (constant on-screen size): close and rotate / resize.
  const H = handles(g, px)
  const handle = (q: V, on: boolean, draw: () => void): void => {
    if (on) {
      ctx.beginPath()
      ctx.arc(q.u, q.v, (HANDLE_R + 7) * px, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(q.u, q.v, (on ? HANDLE_R + 2 : HANDLE_R) * px, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    if (on) {
      ctx.fillStyle = rgba(ACCENT, 0.14)
      ctx.fill()
    }
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    ctx.save()
    ctx.translate(q.u, q.v)
    // Icons stay upright on screen.
    ctx.rotate(-s.rot)
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.8 * px
    ctx.lineCap = 'round'
    draw()
    ctx.restore()
  }
  handle(H.close, hot === 'close', () => {
    const k = 4.5 * px
    ctx.beginPath()
    ctx.moveTo(-k, -k)
    ctx.lineTo(k, k)
    ctx.moveTo(k, -k)
    ctx.lineTo(-k, k)
    ctx.stroke()
  })
  handle(H.rotate, hot === 'rotate', () => {
    const k = 6 * px
    ctx.beginPath()
    ctx.arc(0, 0, k, -Math.PI * 0.9, Math.PI * 0.4)
    ctx.stroke()
    const ex = Math.cos(Math.PI * 0.4) * k
    const ey = Math.sin(Math.PI * 0.4) * k
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + 3.5 * px, ey - 1.5 * px)
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - 0.5 * px, ey - 4 * px)
    ctx.stroke()
  })
  ctx.restore()
}
