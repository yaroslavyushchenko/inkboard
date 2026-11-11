import { circleHitsPolyline } from './geometry'
import { graphBBox } from './graph'
import { textBBox } from './text'
import type { BBox, Item } from './types'

/** Uniform scale `s` about anchor (ax, ay), then translate by (dx, dy): p' = a + (p - a) * s + d */
export interface Xform {
  s: number
  ax: number
  ay: number
  dx: number
  dy: number
}

export const IDENTITY: Xform = { s: 1, ax: 0, ay: 0, dx: 0, dy: 0 }

export function isIdentity(t: Xform): boolean {
  return t.s === 1 && t.dx === 0 && t.dy === 0
}

const tx = (t: Xform, x: number): number => t.ax + (x - t.ax) * t.s + t.dx
const ty = (t: Xform, y: number): number => t.ay + (y - t.ay) * t.s + t.dy

export function xformBBox(b: BBox, t: Xform): BBox {
  return { minX: tx(t, b.minX), minY: ty(t, b.minY), maxX: tx(t, b.maxX), maxY: ty(t, b.maxY) }
}

/** Returns a new item with the transform baked in (same id and z, so undo/redo swaps it cleanly). */
export function applyXform(item: Item, t: Xform): Item {
  if (item.type === 'stroke') {
    return {
      ...item,
      size: item.size * t.s,
      points: item.points.map(([x, y, p]) => [tx(t, x), ty(t, y), p]),
      bbox: xformBBox(item.bbox, t),
      ...(item.shape
        ? { shape: { ...item.shape, ax: tx(t, item.shape.ax), ay: ty(t, item.shape.ay), bx: tx(t, item.shape.bx), by: ty(t, item.shape.by) } }
        : {})
    }
  }
  if (item.type === 'graph') {
    const g = { ...item, ox: tx(t, item.ox), oy: ty(t, item.oy), unit: item.unit * t.s }
    return { ...g, bbox: graphBBox(g) }
  }
  if (item.type === 'text') {
    const n = { ...item, x: tx(t, item.x), y: ty(t, item.y), size: item.size * t.s }
    return { ...n, bbox: textBBox(n) }
  }
  const x = tx(t, item.x)
  const y = ty(t, item.y)
  const w = item.w * t.s
  const h = item.h * t.s
  return { ...item, x, y, w, h, bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h } }
}

export function unionBBox(items: readonly Item[]): BBox | null {
  if (items.length === 0) return null
  const b = { ...items[0].bbox }
  for (const it of items) {
    b.minX = Math.min(b.minX, it.bbox.minX)
    b.minY = Math.min(b.minY, it.bbox.minY)
    b.maxX = Math.max(b.maxX, it.bbox.maxX)
    b.maxY = Math.max(b.maxY, it.bbox.maxY)
  }
  return b
}

export function pointInPolygon(x: number, y: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Items enclosed by a lasso: strokes with most of their points inside, images whose centre is inside. */
export function itemsInLasso(items: readonly Item[], lasso: readonly (readonly [number, number])[]): Item[] {
  if (lasso.length < 3) return []
  const out: Item[] = []
  for (const it of items) {
    if (it.type !== 'stroke') {
      const b = it.bbox
      if (pointInPolygon((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, lasso)) out.push(it)
      continue
    }
    const step = Math.max(1, Math.floor(it.points.length / 40))
    let total = 0
    let inside = 0
    for (let i = 0; i < it.points.length; i += step) {
      total++
      if (pointInPolygon(it.points[i][0], it.points[i][1], lasso)) inside++
    }
    if (inside / total >= 0.5) out.push(it)
  }
  return out
}

/** Topmost item under a world point. `tol` is extra hit tolerance in world units. */
export function hitTest(items: readonly Item[], x: number, y: number, tol: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (x < it.bbox.minX - tol || x > it.bbox.maxX + tol || y < it.bbox.minY - tol || y > it.bbox.maxY + tol) continue
    if (it.type !== 'stroke') return it
    if (circleHitsPolyline(x, y, it.size / 2 + tol, it.points)) return it
  }
  return null
}
