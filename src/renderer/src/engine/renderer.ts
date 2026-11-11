import { drawBackground } from './background'
import { viewportBBox } from './camera'
import { bboxIntersects } from './geometry'
import { getImage } from './images'
import { drawGraph } from './graph'
import { buildInkPath, drawStroke, fillInk, linePath, strokeLine, type InkStyle } from './ink'
import { xformBBox, type Xform } from './transform'
import type { BackgroundKind, BBox, Camera, Item, Point } from './types'

export interface LiveStroke extends InkStyle {
  color: string
  points: Point[]
  geom?: 'line'
}

export interface CursorState {
  sx: number
  sy: number
  /** Pen is in range of the tablet but not touching. */
  penHover: boolean
  /** 'ink' shows a dot of the pen colour and size, 'eraser' a ring. */
  kind: 'ink' | 'eraser'
  color: string
  /** Radius in screen px. */
  radius: number
}

/** Items being moved/scaled are drawn with a live transform until the gesture is committed. */
export interface Preview {
  ids: ReadonlySet<string>
  t: Xform
}

export interface SelectionOverlay {
  /** Selection bounds in world units (already transformed by any live preview). */
  box: BBox | null
  /** Lasso polygon in world units while it's being drawn. */
  lasso: readonly (readonly [number, number])[] | null
}

export const HANDLE_SIZE = 10
export const SELECTION_PAD = 6

const ACCENT = '#4f6bed'

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  c.style.width = `${w}px`
  c.style.height = `${h}px`
}

/**
 * Two stacked canvases: `base` holds paper + committed items, `overlay` holds the stroke being
 * drawn and the pen cursor, so drawing never forces a full board redraw.
 */
export class BoardRenderer {
  private base: CanvasRenderingContext2D
  private overlay: CanvasRenderingContext2D
  width = 0
  height = 0
  dpr = 1

  constructor(
    private baseCanvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement
  ) {
    this.base = baseCanvas.getContext('2d', { alpha: false })!
    // desynchronized = low-latency canvas, important for pen input.
    this.overlay = overlayCanvas.getContext('2d', { desynchronized: true })!
  }

  resize(w: number, h: number, dpr: number): void {
    this.width = w
    this.height = h
    this.dpr = dpr
    sizeCanvas(this.baseCanvas, w, h, dpr)
    sizeCanvas(this.overlayCanvas, w, h, dpr)
  }

  private applyCamera(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const s = cam.zoom * this.dpr
    ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s)
  }

  renderBase(items: readonly Item[], cam: Camera, bg: BackgroundKind, preview: Preview | null): void {
    const ctx = this.base
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawBackground(ctx, bg, cam, this.width, this.height, this.dpr)

    this.applyCamera(ctx, cam)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    drawItems(ctx, items, viewportBBox(cam, this.width, this.height), preview)
  }

  renderOverlay(live: LiveStroke | null, cursor: CursorState | null, cam: Camera, sel: SelectionOverlay): void {
    const ctx = this.overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

    if (sel.lasso && sel.lasso.length > 1) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.beginPath()
      sel.lasso.forEach(([x, y], i) => {
        const sx = (x - cam.x) * cam.zoom
        const sy = (y - cam.y) * cam.zoom
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.closePath()
      ctx.fillStyle = 'rgba(79, 107, 237, 0.06)'
      ctx.fill()
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = ACCENT
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (sel.box) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      const r = selectionScreenRect(sel.box, cam)
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = ACCENT
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      const hs = HANDLE_SIZE
      for (const [hx, hy] of selectionCorners(r)) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
      }
    }

    if (live && live.points.length > 0) {
      this.applyCamera(ctx, cam)
      if (live.geom === 'line') strokeLine(ctx, linePath(live.points), live.color, live.size, live.tool)
      else fillInk(ctx, buildInkPath(live.points, live, false), live.color, live.tool)
    }

    if (cursor) {
      const d = this.dpr
      ctx.setTransform(d, 0, 0, d, 0, 0)
      const { sx, sy } = cursor
      const r = Math.max(cursor.radius, 1.5)

      if (cursor.penHover) {
        // Soft halo: the pen is near the surface but has not touched it yet.
        const g = ctx.createRadialGradient(sx, sy, r, sx, sy, r + 14)
        g.addColorStop(0, 'rgba(79, 107, 237, 0.28)')
        g.addColorStop(1, 'rgba(79, 107, 237, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(sx, sy, r + 14, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      if (cursor.kind === 'eraser') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = 'rgba(60,60,70,0.75)'
        ctx.stroke()
      } else {
        ctx.fillStyle = cursor.color
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(sx, sy, r + 1, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.stroke()
      }
    }
  }
}

/**
 * Draw board items (in world coordinates; the caller sets the camera transform) that intersect `view`.
 * Shared by the live board, thumbnails and PNG export.
 */
export function drawItems(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  items: readonly Item[],
  view: BBox,
  preview: Preview | null = null
): void {
  const c = ctx as CanvasRenderingContext2D
  for (const item of items) {
    const moving = preview?.ids.has(item.id) ? preview.t : null
    if (!bboxIntersects(moving ? xformBBox(item.bbox, moving) : item.bbox, view)) continue
    if (moving) {
      c.save()
      c.translate(moving.ax + moving.dx, moving.ay + moving.dy)
      c.scale(moving.s, moving.s)
      c.translate(-moving.ax, -moving.ay)
    }
    if (item.type === 'stroke') {
      drawStroke(c, item)
    } else if (item.type === 'graph') {
      drawGraph(c, item)
    } else {
      const img = getImage(item.src)
      if (img.complete && img.naturalWidth > 0) c.drawImage(img, item.x, item.y, item.w, item.h)
    }
    if (moving) c.restore()
  }
}

/** Selection rectangle in screen px, padded so thin strokes aren't hidden by the dashed frame. */
export function selectionScreenRect(box: BBox, cam: Camera): { x: number; y: number; w: number; h: number } {
  const x = (box.minX - cam.x) * cam.zoom - SELECTION_PAD
  const y = (box.minY - cam.y) * cam.zoom - SELECTION_PAD
  return {
    x,
    y,
    w: (box.maxX - box.minX) * cam.zoom + SELECTION_PAD * 2,
    h: (box.maxY - box.minY) * cam.zoom + SELECTION_PAD * 2
  }
}

/** Corner handle centres: top-left, top-right, bottom-right, bottom-left. */
export function selectionCorners(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h]
  ]
}
