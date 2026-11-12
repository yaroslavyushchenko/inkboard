import type { Camera, Point } from './types'

/**
 * On-board protractor (a drawing aid, not board content). Lives in world coordinates so it pans and
 * zooms with the board. Local frame: origin at the centre of the baseline, +u along the baseline
 * (rotated by `rot`), the semicircle on the −v side ("above" the baseline).
 */
export interface Protractor {
  x: number
  y: number
  /** Radius in world units. */
  r: number
  /** Rotation of the baseline, radians. */
  rot: number
}

/** Screen-px distances used for handles and edge snapping. */
const HANDLE_OFFSET = 26
const HANDLE_R = 13
const ARC_SNAP = 16
const CENTER_SNAP = 20
const BASE_SNAP = 12
/** The settings handle sits this far below the close handle. */
const SETTINGS_GAP = 34

export function toLocal(p: Protractor, wx: number, wy: number): { u: number; v: number } {
  const dx = wx - p.x
  const dy = wy - p.y
  const c = Math.cos(-p.rot)
  const s = Math.sin(-p.rot)
  return { u: dx * c - dy * s, v: dx * s + dy * c }
}

export function toWorld(p: Protractor, u: number, v: number): { x: number; y: number } {
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  return { x: p.x + u * c - v * s, y: p.y + u * s + v * c }
}

/**
 * Angle on the protractor scale (0° at the right end of the baseline, counter-clockwise on screen).
 * 0..180; points below the baseline clamp to the nearest end.
 */
export function scaleAngle(p: Protractor, wx: number, wy: number): number {
  const { u, v } = toLocal(p, wx, wy)
  let deg = (Math.atan2(-v, u) * 180) / Math.PI
  if (deg < 0) deg = deg < -90 ? 180 : 0 // below the baseline: clamp to the nearest end
  return deg
}

/** Round an angle to the snap step (degrees); step 0 leaves it as it is. */
export function snapDeg(deg: number, step: number): number {
  return step > 0 ? Math.round(deg / step) * step : deg
}

/** "37°", or "37.4°" when not snapped to whole degrees ("37,4°" with a decimal comma). */
export function degText(deg: number, comma = false): string {
  const r = Math.round(deg * 10) / 10
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1)
  return `${comma ? s.replace('.', ',') : s}°`
}

export type ProtractorHit = 'close' | 'rotate' | 'settings' | 'arc' | 'center' | 'base' | 'body'

/** Where the handles are, in the protractor's local frame (u, v). */
function handles(p: Protractor, px: number) {
  return {
    close: { u: -p.r - HANDLE_OFFSET * px, v: 0 },
    settings: { u: -p.r - HANDLE_OFFSET * px, v: SETTINGS_GAP * px },
    rotate: { u: p.r + HANDLE_OFFSET * px, v: 0 }
  }
}

export function hitProtractor(p: Protractor, wx: number, wy: number, zoom: number): ProtractorHit | null {
  const px = 1 / zoom
  const { u, v } = toLocal(p, wx, wy)
  const d = Math.hypot(u, v)
  const H = handles(p, px)
  const near = (q: { u: number; v: number }, rad: number): boolean => Math.hypot(u - q.u, v - q.v) <= rad
  if (near(H.close, (HANDLE_R + 4) * px)) return 'close'
  if (near(H.settings, (HANDLE_R + 4) * px)) return 'settings'
  if (near(H.rotate, (HANDLE_R + 4) * px)) return 'rotate'
  if (d <= CENTER_SNAP * px) return 'center'
  // The arc wins at the corners where it meets the baseline.
  if (v <= BASE_SNAP * px && Math.abs(d - p.r) <= ARC_SNAP * px) return 'arc'
  if (v <= BASE_SNAP * px && v >= -BASE_SNAP * px && Math.abs(u) <= p.r) return 'base'
  if (v <= 0 && d < p.r) return 'body'
  return null
}

/** Points of an arc just outside the protractor edge, between two scale angles (degrees). */
export function arcStroke(p: Protractor, fromDeg: number, toDeg: number, offset: number): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(toDeg - fromDeg) * 2))
  const rr = p.r + offset
  const pts: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180
    const w = toWorld(p, Math.cos(a) * rr, -Math.sin(a) * rr)
    pts.push([w.x, w.y, 0.5])
  }
  return pts
}

/** A ray from the centre at a whole-degree angle, as long as the pointer is far. */
export function rayStroke(p: Protractor, deg: number, length: number): Point[] {
  const a = (deg * Math.PI) / 180
  const end = toWorld(p, Math.cos(a) * length, -Math.sin(a) * length)
  return [
    [p.x, p.y, 0.5],
    [end.x, end.y, 0.5]
  ]
}

/** A straight line along the baseline between two u positions. */
export function baseStroke(p: Protractor, u0: number, u1: number, offset: number): Point[] {
  const a = toWorld(p, u0, offset)
  const b = toWorld(p, u1, offset)
  return [
    [a.x, a.y, 0.5],
    [b.x, b.y, 0.5]
  ]
}

const ACCENT = '#4f6bed'

export interface ProtractorState {
  /** Part under the pointer (or in use): drawn lit. */
  hot: ProtractorHit | null
  /** Scale angle under the pointer on the edge (already snapped), shown as a marker. */
  hoverDeg: number | null
}

/** `#rrggbb` with an alpha, as rgba(). */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Draw the protractor on the overlay canvas (`ctx` has an identity transform, device pixels). */
export function drawProtractor(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  p: Protractor,
  state: ProtractorState = { hot: null, hoverDeg: null }
): void {
  const s = cam.zoom * dpr
  ctx.save()
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s)
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  const px = 1 / cam.zoom // one screen pixel in world units
  const r = p.r
  const col = ACCENT
  const hot = state.hot
  const glow = rgba(col, 0.22)
  // Canvas angles: scale angle d sits at canvas angle -d (y grows downwards).
  const outline = (): void => {
    ctx.beginPath()
    ctx.moveTo(-r, 0)
    ctx.arc(0, 0, r, Math.PI, 2 * Math.PI)
    ctx.closePath()
  }

  // Body: translucent like a real plastic protractor.
  outline()
  ctx.fillStyle = rgba('#e8eeff', hot === 'body' ? 0.67 : 0.55)
  ctx.fill()
  ctx.fillStyle = rgba(col, hot === 'body' ? 0.1 : 0.05)
  ctx.fill()
  ctx.lineWidth = (hot === 'body' ? 2.5 : 1.5) * px
  ctx.strokeStyle = col
  ctx.stroke()

  // Lit edge: where an arc can be drawn.
  if (hot === 'arc') {
    ctx.beginPath()
    ctx.arc(0, 0, r, Math.PI, 2 * Math.PI)
    ctx.lineWidth = 12 * px
    ctx.strokeStyle = glow
    ctx.stroke()
  }

  // Inner window.
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.32, Math.PI, 2 * Math.PI)
  ctx.lineWidth = 1 * px
  ctx.strokeStyle = rgba(col, 0.45)
  ctx.stroke()

  // Degree ticks.
  ctx.strokeStyle = 'rgba(40, 46, 70, 0.85)'
  // Two paths (thin and thick ticks) instead of one stroke per degree: drawn on every pointer move.
  for (const major of [false, true]) {
    ctx.beginPath()
    for (let d = 0; d <= 180; d++) {
      if ((d % 10 === 0) !== major) continue
      const a = (d * Math.PI) / 180
      const len = major ? 0.11 : d % 5 === 0 ? 0.075 : 0.04
      const cx = Math.cos(a)
      const cy = -Math.sin(a)
      ctx.moveTo(cx * r, cy * r)
      ctx.lineTo(cx * r * (1 - len), cy * r * (1 - len))
    }
    ctx.lineWidth = (major ? 1.2 : 0.8) * px
    ctx.stroke()
  }

  // Numbers: outer scale counter-clockwise from the right, inner scale the other way round.
  const font = Math.max(r * 0.05, 9 * px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // One pass per scale, so the font and colour are set twice instead of 38 times.
  const scales = [
    { at: 0.83, size: font, color: '#23283c', text: (d: number) => `${d}` },
    { at: 0.72, size: font * 0.8, color: rgba(col, 0.85), text: (d: number) => `${180 - d}` }
  ]
  const base = ctx.getTransform()
  for (const s of scales) {
    ctx.font = `${s.size}px system-ui, sans-serif`
    ctx.fillStyle = s.color
    for (let d = 0; d <= 180; d += 10) {
      const a = (d * Math.PI) / 180
      ctx.translate(Math.cos(a) * r * s.at, -Math.sin(a) * r * s.at)
      ctx.rotate(Math.PI / 2 - a)
      ctx.fillText(s.text(d), 0, 0)
      ctx.setTransform(base)
    }
  }

  // Baseline and centre mark.
  if (hot === 'base') {
    ctx.beginPath()
    ctx.moveTo(-r, 0)
    ctx.lineTo(r, 0)
    ctx.lineWidth = 10 * px
    ctx.strokeStyle = glow
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.lineWidth = (hot === 'base' ? 2 : 1.2) * px
  ctx.strokeStyle = col
  ctx.stroke()
  if (hot === 'center') {
    ctx.beginPath()
    ctx.arc(0, 0, CENTER_SNAP * px, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = col
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.06)
  ctx.lineTo(0, r * 0.03)
  ctx.moveTo(-r * 0.03, 0)
  ctx.lineTo(r * 0.03, 0)
  ctx.lineWidth = (hot === 'center' ? 2 : 1.2) * px
  ctx.strokeStyle = '#e03131'
  ctx.stroke()

  // The angle under the pointer on the edge: a marker across the scale and its number outside.
  if (state.hoverDeg !== null) {
    const a = (state.hoverDeg * Math.PI) / 180
    const cx = Math.cos(a)
    const cy = -Math.sin(a)
    ctx.beginPath()
    ctx.moveTo(cx * r * 0.62, cy * r * 0.62)
    ctx.lineTo(cx * (r + 6 * px), cy * (r + 6 * px))
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx * r, cy * r, 3.5 * px, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
  }

  // Handles (constant on-screen size): close and settings on the left, rotate/resize on the right.
  const H = handles(p, px)
  const handle = (q: { u: number; v: number }, lit: boolean, draw: () => void): void => {
    if (lit) {
      ctx.beginPath()
      ctx.arc(q.u, q.v, (HANDLE_R + 7) * px, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(q.u, q.v, (lit ? HANDLE_R + 2 : HANDLE_R) * px, 0, Math.PI * 2)
    ctx.fillStyle = lit ? rgba(col, 0.14) : '#fff'
    ctx.fill()
    if (lit) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fill()
    }
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.save()
    ctx.translate(q.u, q.v)
    ctx.strokeStyle = col
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
  handle(H.settings, hot === 'settings', () => drawGear(ctx, px, col))
  handle(H.rotate, hot === 'rotate', () => {
    const k = 6 * px
    ctx.beginPath()
    ctx.arc(0, 0, k, -Math.PI * 0.9, Math.PI * 0.4)
    ctx.stroke()
    ctx.beginPath()
    const ex = Math.cos(Math.PI * 0.4) * k
    const ey = Math.sin(Math.PI * 0.4) * k
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + 3.5 * px, ey - 1.5 * px)
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - 0.5 * px, ey - 4 * px)
    ctx.stroke()
  })
  ctx.restore()
}

/** A small gear (settings) centred on the origin, for the instrument handles. */
export function drawGear(ctx: CanvasRenderingContext2D, px: number, color: string): void {
  ctx.save()
  ctx.lineWidth = 1.6 * px
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, 4.2 * px, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.moveTo(Math.cos(a) * 4.2 * px, Math.sin(a) * 4.2 * px)
    ctx.lineTo(Math.cos(a) * 6.6 * px, Math.sin(a) * 6.6 * px)
  }
  ctx.lineWidth = 2.2 * px
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 1.6 * px, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

/** Small "37°" pill next to the pointer while drawing with the protractor. */
export function drawAngleLabel(ctx: CanvasRenderingContext2D, dpr: number, sx: number, sy: number, text: string, hint = false): void {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.font = `${hint ? 500 : 600} 13px system-ui, sans-serif`
  const w = ctx.measureText(text).width + 14
  // A hint sits below-right of the pointer, out of the way of what it points at.
  const x = sx + 16
  const y = hint ? sy + 18 : sy - 30
  ctx.beginPath()
  ctx.roundRect(x, y, w, 22, 11)
  ctx.fillStyle = hint ? 'rgba(255, 255, 255, 0.95)' : ACCENT
  ctx.fill()
  if (hint) {
    ctx.lineWidth = 1
    ctx.strokeStyle = ACCENT
    ctx.stroke()
  }
  ctx.fillStyle = hint ? ACCENT : '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 7, y + 11)
  ctx.restore()
}
