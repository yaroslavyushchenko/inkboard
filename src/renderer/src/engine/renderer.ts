import { drawBackground } from './background'
import { viewportBBox } from './camera'
import { bboxIntersects } from './geometry'
import { getImage } from './images'
import { buildInkPath, fillInk, strokePath, type InkStyle } from './ink'
import type { BackgroundKind, Camera, Item, Point } from './types'

export interface LiveStroke extends InkStyle {
  color: string
  points: Point[]
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

  renderBase(items: readonly Item[], cam: Camera, bg: BackgroundKind): void {
    const ctx = this.base
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawBackground(ctx, bg, cam, this.width, this.height, this.dpr)

    this.applyCamera(ctx, cam)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const view = viewportBBox(cam, this.width, this.height)
    for (const item of items) {
      if (!bboxIntersects(item.bbox, view)) continue
      if (item.type === 'stroke') {
        fillInk(ctx, strokePath(item), item.color, item.tool)
      } else {
        const img = getImage(item.src)
        if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, item.x, item.y, item.w, item.h)
      }
    }
  }

  renderOverlay(live: LiveStroke | null, cursor: CursorState | null, cam: Camera): void {
    const ctx = this.overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

    if (live && live.points.length > 0) {
      this.applyCamera(ctx, cam)
      fillInk(ctx, buildInkPath(live.points, live, false), live.color, live.tool)
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
