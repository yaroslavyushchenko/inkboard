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

/** Angle on the protractor scale (0° at the right end of the baseline, 180° at the left). */
export function scaleAngle(p: Protractor, wx: number, wy: number): number {
  const { u, v } = toLocal(p, wx, wy)
  let deg = (Math.atan2(-v, u) * 180) / Math.PI
  if (deg < 0) deg = deg < -90 ? 180 : 0 // below the baseline: clamp to the nearest end
  return deg
}

export type ProtractorHit = 'close' | 'rotate' | 'arc' | 'center' | 'base' | 'body'

export function hitProtractor(p: Protractor, wx: number, wy: number, zoom: number): ProtractorHit | null {
  const px = 1 / zoom
  const { u, v } = toLocal(p, wx, wy)
  const d = Math.hypot(u, v)
  const near = (cu: number, cv: number, rad: number): boolean => Math.hypot(u - cu, v - cv) <= rad
  if (near(-p.r - HANDLE_OFFSET * px, 0, (HANDLE_R + 4) * px)) return 'close'
  if (near(p.r + HANDLE_OFFSET * px, 0, (HANDLE_R + 4) * px)) return 'rotate'
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

/** Draw the protractor on the overlay canvas (`ctx` has an identity transform, device pixels). */
export function drawProtractor(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, p: Protractor): void {
  const s = cam.zoom * dpr
  ctx.save()
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s)
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  const px = 1 / cam.zoom // one screen pixel in world units
  const r = p.r

  // Body: translucent like a real plastic protractor.
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.arc(0, 0, r, Math.PI, 2 * Math.PI)
  ctx.closePath()
  ctx.fillStyle = 'rgba(232, 238, 255, 0.55)'
  ctx.fill()
  ctx.lineWidth = 1.5 * px
  ctx.strokeStyle = ACCENT
  ctx.stroke()

  // Inner window.
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.32, Math.PI, 2 * Math.PI)
  ctx.lineWidth = 1 * px
  ctx.strokeStyle = 'rgba(79, 107, 237, 0.45)'
  ctx.stroke()

  // Degree ticks.
  ctx.strokeStyle = 'rgba(40, 46, 70, 0.85)'
  for (let d = 0; d <= 180; d++) {
    const a = (d * Math.PI) / 180
    const len = d % 10 === 0 ? 0.11 : d % 5 === 0 ? 0.075 : 0.04
    const cx = Math.cos(a)
    const cy = -Math.sin(a)
    ctx.beginPath()
    ctx.moveTo(cx * r, cy * r)
    ctx.lineTo(cx * r * (1 - len), cy * r * (1 - len))
    ctx.lineWidth = (d % 10 === 0 ? 1.2 : 0.8) * px
    ctx.stroke()
  }

  // Numbers: outer scale counter-clockwise from the right, inner scale from the left.
  const font = Math.max(r * 0.05, 9 * px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let d = 0; d <= 180; d += 10) {
    const a = (d * Math.PI) / 180
    const cx = Math.cos(a)
    const cy = -Math.sin(a)
    ctx.save()
    ctx.translate(cx * r * 0.83, cy * r * 0.83)
    ctx.rotate(Math.PI / 2 - a)
    ctx.font = `${font}px system-ui, sans-serif`
    ctx.fillStyle = '#23283c'
    ctx.fillText(`${d}`, 0, 0)
    ctx.restore()
    ctx.save()
    ctx.translate(cx * r * 0.72, cy * r * 0.72)
    ctx.rotate(Math.PI / 2 - a)
    ctx.font = `${font * 0.8}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(79, 107, 237, 0.85)'
    ctx.fillText(`${180 - d}`, 0, 0)
    ctx.restore()
  }

  // Baseline and centre mark.
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.lineWidth = 1.2 * px
  ctx.strokeStyle = ACCENT
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.06)
  ctx.lineTo(0, r * 0.03)
  ctx.moveTo(-r * 0.03, 0)
  ctx.lineTo(r * 0.03, 0)
  ctx.lineWidth = 1.2 * px
  ctx.strokeStyle = '#e03131'
  ctx.stroke()

  // Handles (constant on-screen size): close on the left, rotate/resize on the right.
  const handle = (u: number, draw: () => void): void => {
    ctx.beginPath()
    ctx.arc(u, 0, HANDLE_R * px, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    ctx.save()
    ctx.translate(u, 0)
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.8 * px
    ctx.lineCap = 'round'
    draw()
    ctx.restore()
  }
  handle(-r - HANDLE_OFFSET * px, () => {
    const k = 4.5 * px
    ctx.beginPath()
    ctx.moveTo(-k, -k)
    ctx.lineTo(k, k)
    ctx.moveTo(k, -k)
    ctx.lineTo(-k, k)
    ctx.stroke()
  })
  handle(r + HANDLE_OFFSET * px, () => {
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

/** Small "37°" pill next to the pointer while drawing with the protractor. */
export function drawAngleLabel(ctx: CanvasRenderingContext2D, dpr: number, sx: number, sy: number, text: string): void {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.font = '600 13px system-ui, sans-serif'
  const w = ctx.measureText(text).width + 14
  const x = sx + 16
  const y = sy - 30
  ctx.beginPath()
  ctx.roundRect(x, y, w, 22, 11)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 7, y + 11)
  ctx.restore()
}
