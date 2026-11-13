import type { Camera, Point } from '@inkboard/core/types'

/**
 * On-board compass (a drawing aid, not board content), in world coordinates like the protractor.
 * The needle stands at (x, y); the pencil is at distance `r` in direction `a` (radians, y down).
 *
 * - drag the needle or a leg: move the compass;
 * - drag the ↔ handle beyond the pencil: open / close the legs (radius) and turn them;
 * - drag the pencil: it turns around the needle and draws an arc (a full turn = a circle).
 */
export interface Compass {
  x: number
  y: number
  r: number
  a: number
}

/** One cell of the dotted / squared paper, the unit the radius is shown in. */
export const COMPASS_CELL = 24

/** Screen-px sizes of the handles. */
const NEEDLE_R = 16
const PENCIL_R = 18
const HANDLE_R = 13
const HANDLE_GAP = 34
const LEG_HIT = 9

export type CompassHit = 'close' | 'radius' | 'pencil' | 'needle' | 'body'

export const pencilAt = (c: Compass): { x: number; y: number } => ({ x: c.x + Math.cos(c.a) * c.r, y: c.y + Math.sin(c.a) * c.r })

/** Unit normal of the legs pointing "up" on screen: the hinge sits on that side. */
function upNormal(c: Compass): { x: number; y: number } {
  const nx = Math.sin(c.a)
  const ny = -Math.cos(c.a)
  return ny < 0 || (ny === 0 && nx < 0) ? { x: nx, y: ny } : { x: -nx, y: -ny }
}

/** Where the hinge, the ↔ handle and the close button are, for a zoom level. */
function layout(c: Compass, zoom: number) {
  const px = 1 / zoom
  const p = pencilAt(c)
  const n = upNormal(c)
  const h = Math.max(c.r * 0.55, 46 * px)
  const hinge = { x: (c.x + p.x) / 2 + n.x * h, y: (c.y + p.y) / 2 + n.y * h }
  const dx = Math.cos(c.a)
  const dy = Math.sin(c.a)
  const radius = { x: p.x + dx * HANDLE_GAP * px, y: p.y + dy * HANDLE_GAP * px }
  const close = { x: hinge.x + n.x * 30 * px, y: hinge.y + n.y * 30 * px }
  return { p, n, hinge, radius, close, px }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)))
  return Math.hypot(px - ax - vx * t, py - ay - vy * t)
}

export function hitCompass(c: Compass, wx: number, wy: number, zoom: number): CompassHit | null {
  const L = layout(c, zoom)
  const near = (q: { x: number; y: number }, rad: number): boolean => Math.hypot(wx - q.x, wy - q.y) <= rad * L.px
  if (near(L.close, HANDLE_R + 3)) return 'close'
  if (near(L.radius, HANDLE_R + 3)) return 'radius'
  if (near(L.p, PENCIL_R)) return 'pencil'
  if (near(c, NEEDLE_R)) return 'needle'
  const legs = segDist(wx, wy, c.x, c.y, L.hinge.x, L.hinge.y) <= LEG_HIT * L.px || segDist(wx, wy, L.hinge.x, L.hinge.y, L.p.x, L.p.y) <= LEG_HIT * L.px
  return legs || near(L.hinge, 14) ? 'body' : null
}

/** Radius from the ↔ handle position, in whole and half paper cells. */
export function radiusFromHandle(c: Compass, wx: number, wy: number, zoom: number): Compass {
  const d = Math.hypot(wx - c.x, wy - c.y)
  const step = COMPASS_CELL / 2
  const r = Math.max(step, Math.round((d - HANDLE_GAP / zoom) / step) * step)
  return { ...c, r, a: Math.atan2(wy - c.y, wx - c.x) }
}

/** Points of the arc the pencil drew: from angle a0, turned by `sweep` radians. */
export function compassArc(c: Compass, a0: number, sweep: number): Point[] {
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) * 180) / Math.PI))
  const pts: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps
    pts.push([c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, 0.5])
  }
  return pts
}

/** Arc sweeps snap to quarter turns when the pencil is this close to one (screen px along the arc). */
const SNAP_PX = 8

/** Snap a pencil sweep (radians) to the nearest multiple of 90° when it is within a few screen px of it. */
export function snapSweep(sweep: number, r: number, zoom: number): number {
  const q = Math.PI / 2
  const k = Math.max(-4, Math.min(4, Math.round(sweep / q)))
  if (k === 0) return sweep
  return Math.abs(sweep - k * q) * r * zoom < SNAP_PX ? k * q : sweep
}

/** Tick marks along the radius line: whole cells, plus half cells when there is room on screen. */
export function radiusTicks(r: number, zoom: number): { d: number; half: boolean }[] {
  const cellPx = COMPASS_CELL * zoom
  if (cellPx < 4) return []
  const halves = cellPx / 2 >= 6
  const out: { d: number; half: boolean }[] = []
  const step = halves ? COMPASS_CELL / 2 : COMPASS_CELL
  for (let i = 1; i * step <= r + 1e-6; i++) out.push({ d: i * step, half: halves && i % 2 === 1 })
  return out
}

/** Radius in paper cells (one decimal) and which plural form of "cell" it takes (Ukrainian rules; English uses one / other). */
export function radiusCells(r: number): { n: number; form: 'cell1' | 'cellFew' | 'cellMany' | 'cellFrac' } {
  const n = Math.round((r / COMPASS_CELL) * 10) / 10
  if (!Number.isInteger(n)) return { n, form: 'cellFrac' }
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return { n, form: 'cell1' }
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return { n, form: 'cellFew' }
  return { n, form: 'cellMany' }
}

const ACCENT = '#4f6bed'
const METAL = '#5c6270'
const GLOW = 'rgba(79, 107, 237, 0.22)'

/** How the compass answers the pointer. */
export interface CompassState {
  /** Part under the pointer (or being dragged): drawn lit. */
  hot: CompassHit | null
  /** While the pencil draws: the start angle, for the quarter-turn marks. */
  sweepFrom: number | null
  /** Show cell ticks on the radius line. */
  ticks: boolean
}

/** Draw the compass on the overlay canvas (`ctx` has an identity transform, device pixels). */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  c: Compass,
  pencilColor: string,
  label: string,
  state: CompassState = { hot: null, sweepFrom: null, ticks: false }
): void {
  const s = cam.zoom * dpr
  const L = layout(c, cam.zoom)
  const px = L.px
  const hot = state.hot
  const glow = (x: number, y: number, rad: number): void => {
    ctx.beginPath()
    ctx.arc(x, y, rad * px, 0, Math.PI * 2)
    ctx.fillStyle = GLOW
    ctx.fill()
  }
  ctx.save()
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Where the pencil will go: a faint full circle.
  ctx.beginPath()
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
  ctx.setLineDash([4 * px, 6 * px])
  ctx.lineWidth = 1 * px
  ctx.strokeStyle = 'rgba(79, 107, 237, 0.35)'
  ctx.stroke()

  // Radius: dashed line needle → pencil with its length.
  ctx.beginPath()
  ctx.moveTo(c.x, c.y)
  ctx.lineTo(L.p.x, L.p.y)
  ctx.setLineDash([5 * px, 4 * px])
  ctx.lineWidth = 1.2 * px
  ctx.strokeStyle = ACCENT
  ctx.stroke()
  ctx.setLineDash([])

  // Cell ticks across the radius line: where the ↔ handle snaps.
  if (state.ticks) {
    const ux = Math.cos(c.a)
    const uy = Math.sin(c.a)
    ctx.beginPath()
    for (const t of radiusTicks(c.r, cam.zoom)) {
      const k = (t.half ? 3 : 6) * px
      const x = c.x + ux * t.d
      const y = c.y + uy * t.d
      ctx.moveTo(x - uy * k, y + ux * k)
      ctx.lineTo(x + uy * k, y - ux * k)
    }
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
  }

  // While drawing: where the arc started and the quarter turns it snaps to.
  if (state.sweepFrom !== null) {
    ctx.beginPath()
    for (let k = 1; k < 4; k++) {
      const a = state.sweepFrom + (k * Math.PI) / 2
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      ctx.moveTo(c.x + ux * (c.r - 7 * px), c.y + uy * (c.r - 7 * px))
      ctx.lineTo(c.x + ux * (c.r + 7 * px), c.y + uy * (c.r + 7 * px))
    }
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(c.x + Math.cos(state.sweepFrom) * c.r, c.y + Math.sin(state.sweepFrom) * c.r, 4 * px, 0, Math.PI * 2)
    ctx.fillStyle = ACCENT
    ctx.fill()
  }

  // Legs and hinge.
  const bodyHot = hot === 'body'
  ctx.beginPath()
  ctx.moveTo(c.x, c.y)
  ctx.lineTo(L.hinge.x, L.hinge.y)
  ctx.lineTo(L.p.x, L.p.y)
  if (bodyHot) {
    ctx.lineWidth = 14 * px
    ctx.strokeStyle = GLOW
    ctx.stroke()
  }
  ctx.lineWidth = 6 * px
  ctx.strokeStyle = bodyHot ? 'rgba(79, 107, 237, 0.85)' : 'rgba(92, 98, 112, 0.75)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(L.hinge.x, L.hinge.y, 8 * px, 0, Math.PI * 2)
  ctx.fillStyle = bodyHot ? ACCENT : METAL
  ctx.fill()
  ctx.beginPath()
  ctx.arc(L.hinge.x, L.hinge.y, 3 * px, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()

  // Needle.
  if (hot === 'needle') glow(c.x, c.y, 17)
  ctx.beginPath()
  ctx.arc(c.x, c.y, (hot === 'needle' ? 11 : 9) * px, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.fill()
  ctx.lineWidth = (hot === 'needle' ? 2 : 1.5) * px
  ctx.strokeStyle = hot === 'needle' ? ACCENT : METAL
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c.x, c.y, 2.5 * px, 0, Math.PI * 2)
  ctx.fillStyle = '#e03131'
  ctx.fill()

  // Pencil tip in the ink colour.
  const pencilHot = hot === 'pencil'
  if (pencilHot) glow(L.p.x, L.p.y, 20)
  ctx.beginPath()
  ctx.arc(L.p.x, L.p.y, (pencilHot ? 13 : 11) * px, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = (pencilHot ? 2.5 : 2) * px
  ctx.strokeStyle = pencilHot ? ACCENT : METAL
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(L.p.x, L.p.y, (pencilHot ? 7.5 : 6) * px, 0, Math.PI * 2)
  ctx.fillStyle = pencilColor
  ctx.fill()

  const handle = (q: { x: number; y: number }, lit: boolean, draw: () => void): void => {
    if (lit) glow(q.x, q.y, HANDLE_R + 7)
    ctx.beginPath()
    ctx.arc(q.x, q.y, (lit ? HANDLE_R + 2 : HANDLE_R) * px, 0, Math.PI * 2)
    ctx.fillStyle = lit ? '#e6eafd' : '#fff'
    ctx.fill()
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    ctx.save()
    ctx.translate(q.x, q.y)
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.8 * px
    draw()
    ctx.restore()
  }
  // ↔ along the legs: open / close.
  handle(L.radius, hot === 'radius', () => {
    ctx.rotate(c.a)
    const k = 6 * px
    ctx.beginPath()
    ctx.moveTo(-k, 0)
    ctx.lineTo(k, 0)
    ctx.moveTo(-k + 3 * px, -3 * px)
    ctx.lineTo(-k, 0)
    ctx.lineTo(-k + 3 * px, 3 * px)
    ctx.moveTo(k - 3 * px, -3 * px)
    ctx.lineTo(k, 0)
    ctx.lineTo(k - 3 * px, 3 * px)
    ctx.stroke()
  })
  handle(L.close, hot === 'close', () => {
    const k = 4.5 * px
    ctx.beginPath()
    ctx.moveTo(-k, -k)
    ctx.lineTo(k, k)
    ctx.moveTo(k, -k)
    ctx.lineTo(-k, k)
    ctx.stroke()
  })

  // Radius label below the middle of the radius line (on the side away from the hinge).
  ctx.font = `600 ${12 * px}px system-ui, sans-serif`
  const w = ctx.measureText(label).width + 12 * px
  const mx = (c.x + L.p.x) / 2 - L.n.x * 16 * px
  const my = (c.y + L.p.y) / 2 - L.n.y * 16 * px
  ctx.beginPath()
  ctx.roundRect(mx - w / 2, my - 10 * px, w, 20 * px, 10 * px)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.fill()
  ctx.lineWidth = 1 * px
  ctx.strokeStyle = ACCENT
  ctx.stroke()
  ctx.fillStyle = ACCENT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, mx, my + 0.5 * px)
  ctx.restore()
}
