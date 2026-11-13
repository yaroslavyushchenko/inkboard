import { drawBackground } from './background'
import { viewportBBox } from '@inkboard/core/camera'
import { bboxIntersects } from '@inkboard/core/geometry'
import { getImage } from './images'
import { drawFormula } from './formulatype'
import { drawGraph } from './graph'
import { drawText } from './text'
import { drawCompass, type Compass, type CompassState } from './compass'
import { drawAngleLabel, drawProtractor, type Protractor, type ProtractorState } from './protractor'
import { drawStraightedge, type Straightedge, type StraightState } from './straightedge'
import { inkColor, isChalk, withInkSurface } from './surface'
import { buildInkPath, drawCaps, drawStroke, fillInk, linePath, strokeLine, type InkStyle } from './ink'
import { xformBBox, type Xform } from './transform'
import type { BackgroundKind, BBox, Camera, Item, LineCap, LineDash, Point } from '@inkboard/core/types'

export interface LiveStroke extends InkStyle {
  color: string
  points: Point[]
  geom?: 'line'
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
  /** Multi-part preview (3D shapes: visible edges + dashed hidden edges). */
  parts?: { points: Point[]; dash?: LineDash }[]
}

export interface CursorState {
  sx: number
  sy: number
  /** Pen is in range of the tablet but not touching. */
  penHover: boolean
  /** 'ink' shows a dot of the pen colour and size, 'eraser' a ring, 'select' the brush-select circle, 'laser' a glowing red dot. */
  kind: 'ink' | 'eraser' | 'select' | 'laser'
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
  /** Item (or whole group) under the pointer in select / move mode. */
  hover?: BBox | null
  /** Selection contains locked items: plain frame with a padlock, no handles. */
  locked?: boolean
  /** Corner (resize) handles; off for a single straight line, which shows its end points instead. */
  corners?: boolean
  /** Edge-midpoint handles that stretch an editable shape. */
  sides?: boolean
  /** End points of a straight line that can be dragged (world units). */
  ends?: readonly (readonly [number, number])[] | null
}

export const HANDLE_SIZE = 10
/** Radius of the round end-point handles of straight lines (screen px). */
export const END_HANDLE_R = 7
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
  /** Background of the last base render: the overlay draws live ink for the same surface. */
  private bg: BackgroundKind = 'dots'

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

  /** Offscreen layer the selection is drawn into before it is tinted and lifted. */
  private liftCanvas: HTMLCanvasElement | null = null

  renderBase(items: readonly Item[], cam: Camera, bg: BackgroundKind, preview: Preview | null, selected?: ReadonlySet<string>): void {
    const ctx = this.base
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.bg = bg
    drawBackground(ctx, bg, cam, this.width, this.height, this.dpr)

    this.applyCamera(ctx, cam)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const view = viewportBBox(cam, this.width, this.height)
    if (!selected?.size) {
      withInkSurface(bg, () => drawItems(ctx, items, view, preview))
      return
    }
    // The selection is drawn on top, tinted and lifted off the board with a soft shadow, so it's
    // clear what is picked up. Only the screen changes: the items keep their colours.
    const picked = items.filter((i) => selected.has(i.id))
    withInkSurface(bg, () => drawItems(ctx, items.filter((i) => !selected.has(i.id)), view, preview))
    const layer = (this.liftCanvas ??= document.createElement('canvas'))
    if (layer.width !== this.baseCanvas.width || layer.height !== this.baseCanvas.height) {
      layer.width = this.baseCanvas.width
      layer.height = this.baseCanvas.height
    }
    const l = layer.getContext('2d')!
    l.setTransform(1, 0, 0, 1, 0, 0)
    l.clearRect(0, 0, layer.width, layer.height)
    this.applyCamera(l, cam)
    l.imageSmoothingEnabled = true
    l.imageSmoothingQuality = 'high'
    withInkSurface(bg, () => drawItems(l, picked, view, preview))
    l.setTransform(1, 0, 0, 1, 0, 0)
    l.globalCompositeOperation = 'source-atop'
    l.fillStyle = SELECT_TINT
    l.fillRect(0, 0, layer.width, layer.height)
    l.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // On the dark chalkboard a shadow barely shows: make it deeper and wider there.
    const chalk = isChalk(bg)
    ctx.shadowColor = chalk ? 'rgba(0, 0, 0, 0.85)' : 'rgba(20, 30, 60, 0.32)'
    ctx.shadowBlur = (chalk ? 20 : 14) * this.dpr
    ctx.shadowOffsetY = (chalk ? 9 : 6) * this.dpr
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
  }

  renderOverlay(
    live: LiveStroke | null,
    cursor: CursorState | null,
    cam: Camera,
    sel: SelectionOverlay,
    extras: {
      ruler?: { s: Straightedge; state: StraightState } | null
      setSquare?: { s: Straightedge; state: StraightState } | null
      protractor?: { p: Protractor; state: ProtractorState } | null
      compass?: { c: Compass; color: string; label: string; state: CompassState } | null
      /** Short hint next to the pointer (what dragging the part under it does). */
      hint?: { sx: number; sy: number; text: string } | null
      angleLabel?: { sx: number; sy: number; text: string } | null
      /** Laser pointer trail: world points with the time each was drawn. */
      laser?: { points: readonly (readonly [number, number, number])[]; now: number; fade: number } | null
    } = {}
  ): void {
    const ctx = this.overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)
    if (extras.ruler) drawStraightedge(ctx, cam, this.dpr, extras.ruler.s, extras.ruler.state)
    if (extras.setSquare) drawStraightedge(ctx, cam, this.dpr, extras.setSquare.s, extras.setSquare.state)
    if (extras.protractor) drawProtractor(ctx, cam, this.dpr, extras.protractor.p, extras.protractor.state)
    if (extras.compass) drawCompass(ctx, cam, this.dpr, extras.compass.c, extras.compass.color, extras.compass.label, extras.compass.state)

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

    if (sel.hover) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      const r = selectionScreenRect(sel.hover, cam)
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 6)
      ctx.fillStyle = 'rgba(79, 107, 237, 0.07)'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(79, 107, 237, 0.7)'
      ctx.stroke()
    }

    if (sel.box) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      const r = selectionScreenRect(sel.box, cam)
      ctx.setLineDash(sel.locked ? [] : [6, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = sel.locked ? 'rgba(90, 96, 120, 0.8)' : ACCENT
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      if (sel.locked) {
        drawPadlock(ctx, r.x + r.w, r.y)
      } else {
        const hs = HANDLE_SIZE
        if (sel.corners !== false) {
          for (const [hx, hy] of selectionCorners(r)) {
            ctx.fillStyle = '#fff'
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
            ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
          }
        }
        if (sel.sides) {
          for (const [hx, hy] of selectionSides(r)) {
            ctx.beginPath()
            ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, 3)
            ctx.fillStyle = ACCENT
            ctx.fill()
            ctx.strokeStyle = '#fff'
            ctx.stroke()
            ctx.strokeStyle = ACCENT
          }
        }
      }
    }

    if (sel.ends?.length) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      for (const [x, y] of sel.ends) {
        const sx = (x - cam.x) * cam.zoom
        const sy = (y - cam.y) * cam.zoom
        ctx.beginPath()
        ctx.arc(sx, sy, END_HANDLE_R, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = ACCENT
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(sx, sy, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = ACCENT
        ctx.fill()
      }
    }

    if (extras.laser) drawLaser(ctx, cam, this.dpr, extras.laser)

    if (live && (live.points.length > 0 || live.parts?.length)) {
      this.applyCamera(ctx, cam)
      withInkSurface(this.bg, () => drawLive(ctx, live))
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
      if (cursor.kind === 'laser') {
        ctx.shadowColor = LASER
        ctx.shadowBlur = 12
        ctx.fillStyle = LASER
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.lineWidth = 1.5
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
      } else if (cursor.kind === 'select') {
        ctx.fillStyle = 'rgba(79, 107, 237, 0.08)'
        ctx.fill()
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1.5
        ctx.strokeStyle = ACCENT
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(sx, sy, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = ACCENT
        ctx.fill()
      } else if (cursor.kind === 'eraser') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = 'rgba(60,60,70,0.75)'
        ctx.stroke()
      } else {
        ctx.fillStyle = withInkSurface(this.bg, () => inkColor(cursor.color))
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
    if (extras.angleLabel) drawAngleLabel(ctx, this.dpr, extras.angleLabel.sx, extras.angleLabel.sy, extras.angleLabel.text)
    else if (extras.hint) drawAngleLabel(ctx, this.dpr, extras.hint.sx, extras.hint.sy, extras.hint.text, true)
  }
}

const LASER = '#ff2d2d'
/** Tint laid over selected items (the accent colour, see-through). */
const SELECT_TINT = 'rgba(79, 107, 237, 0.38)'

/** Laser pointer: a glowing red trail in screen space that fades with age (never saved to the board). */
function drawLaser(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  laser: { points: readonly (readonly [number, number, number])[]; now: number; fade: number }
): void {
  const pts = laser.points
  if (!pts.length) return
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = LASER
  ctx.shadowBlur = 10
  ctx.strokeStyle = LASER
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const life = 1 - (laser.now - b[2]) / laser.fade
    if (life <= 0) continue
    ctx.globalAlpha = Math.min(1, life * 1.4)
    ctx.lineWidth = 2 + 3 * life
    ctx.beginPath()
    ctx.moveTo((a[0] - cam.x) * cam.zoom, (a[1] - cam.y) * cam.zoom)
    ctx.lineTo((b[0] - cam.x) * cam.zoom, (b[1] - cam.y) * cam.zoom)
    ctx.stroke()
  }
  ctx.restore()
}

/** The stroke being drawn (overlay canvas, camera transform already set). */
function drawLive(ctx: CanvasRenderingContext2D, live: LiveStroke): void {
  if (live.parts) {
    for (const part of live.parts) strokeLine(ctx, linePath(part.points), live.color, live.size, live.tool, part.dash ?? live.dash)
    if (live.parts.length === 1 && (live.startCap || live.endCap)) drawCaps(ctx, { ...live, points: live.parts[0].points })
  } else if (live.geom === 'line' || live.dash) {
    strokeLine(ctx, linePath(live.points), live.color, live.size, live.tool, live.dash)
    if (live.startCap || live.endCap) drawCaps(ctx, live)
  } else {
    fillInk(ctx, buildInkPath(live.points, live, false), live.color, live.tool)
    if (live.startCap || live.endCap) drawCaps(ctx, live)
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
    } else if (item.type === 'text') {
      drawText(c, item)
    } else if (item.type === 'formula') {
      drawFormula(c, item)
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

/** Edge-midpoint handles: top, right, bottom, left. */
export function selectionSides(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  return [
    [r.x + r.w / 2, r.y],
    [r.x + r.w, r.y + r.h / 2],
    [r.x + r.w / 2, r.y + r.h],
    [r.x, r.y + r.h / 2]
  ]
}

/** Small padlock badge at a corner of a locked selection (ctx in screen px). */
function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.arc(0, 0, 11, 0, Math.PI * 2)
  ctx.fillStyle = 'rgb(90, 96, 120)'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, -2, 3, Math.PI, 0)
  ctx.lineTo(3, 0)
  ctx.moveTo(-3, 0)
  ctx.lineTo(-3, -2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.fillRect(-4.5, -0.5, 9, 6.5)
  ctx.restore()
}
