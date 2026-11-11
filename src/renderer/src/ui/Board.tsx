import { useEffect, useRef } from 'react'
import { panBy, screenToWorld, zoomAt } from '../engine/camera'
import { bboxIntersects, bboxOfPoints, circleHitsPolyline, newId } from '../engine/geometry'
import { setImageLoadListener } from '../engine/images'
import {
  BoardRenderer,
  HANDLE_SIZE,
  selectionCorners,
  selectionScreenRect,
  type CursorState,
  type LiveStroke
} from '../engine/renderer'
import { DEFAULT_SHAPE_SIZE, isLinear, shapeOutline, snapAngle, type ShapeKind } from '../engine/shapes'
import { hitTest, itemsInLasso } from '../engine/transform'
import type { BBox, Item, Point, StrokeItem } from '../engine/types'
import { editor } from '../editor'
import { useUI, type PenAction, type Tool } from '../store'

type Effective = 'ink' | 'eraser' | 'pan' | 'select' | 'shape' | 'move'

type Gesture =
  | { kind: 'ink'; pointerId: number; live: LiveStroke; start: Point }
  | { kind: 'shape'; pointerId: number; shape: ShapeKind; ax: number; ay: number; sx: number; sy: number; moved: boolean; live: LiveStroke }
  | { kind: 'eraser'; pointerId: number; removed: Item[]; lastX: number; lastY: number }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'pinch'; dist: number; cx: number; cy: number }
  | { kind: 'lasso'; pointerId: number; points: [number, number][]; startX: number; startY: number; moved: boolean }
  | { kind: 'move'; pointerId: number; startX: number; startY: number }
  | { kind: 'scale'; pointerId: number; ax: number; ay: number; cx: number; cy: number }

interface Hover {
  sx: number
  sy: number
  pointerType: string
  buttons: number
}

/** Ignore finger touches for this long after the pen was last seen (palm rejection). */
const PALM_REJECT_MS = 800

export function Board() {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const baseCanvas = baseRef.current!
    const overlay = overlayRef.current!
    const renderer = new BoardRenderer(baseCanvas, overlay)
    const scene = editor.scene

    let gesture: Gesture | null = null
    let hover: Hover | null = null
    let spaceDown = false
    let lastPenTime = -Infinity
    const touches = new Map<number, { x: number; y: number }>()

    // ---------- render loop ----------
    let baseDirty = true
    let overlayDirty = true
    let raf = 0

    const frame = (): void => {
      raf = 0
      const ui = useUI.getState()
      if (baseDirty) renderer.renderBase(scene.getItems(), editor.camera, ui.background, editor.preview)
      if (overlayDirty) {
        const live = gesture?.kind === 'ink' || gesture?.kind === 'shape' ? gesture.live : null
        renderer.renderOverlay(live, cursorState(), editor.camera, {
          box: ui.selectedIds.length ? editor.selectionBBox() : null,
          lasso: gesture?.kind === 'lasso' ? gesture.points : null,
          hover: gesture ? null : hoverBox
        })
      }
      baseDirty = false
      overlayDirty = false
    }

    const invalidate = (base = true): void => {
      if (base) baseDirty = true
      overlayDirty = true
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const detach = editor.attach(invalidate)
    setImageLoadListener(() => invalidate(true))

    // ---------- helpers ----------
    const capture = (id: number): void => {
      try {
        overlay.setPointerCapture(id)
      } catch {
        // Pointer already gone (or a synthetic event) — capture is best-effort.
      }
    }
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = overlay.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const toolEffect = (tool: Tool): Effective =>
      tool === 'eraser' ? 'eraser' : tool === 'pan' ? 'pan' : tool === 'select' ? 'select' : tool === 'shape' ? 'shape' : tool === 'move' ? 'move' : 'ink'

    /** What a press at screen point (sx, sy) would grab on the current selection. */
    const selectionHit = (sx: number, sy: number): { kind: 'handle'; corner: number; box: BBox } | { kind: 'body' } | null => {
      if (!useUI.getState().selectedIds.length) return null
      const box = editor.selectionBBox()
      if (!box) return null
      const r = selectionScreenRect(box, editor.camera)
      const corners = selectionCorners(r)
      const reach = HANDLE_SIZE + (hover?.pointerType === 'mouse' ? 0 : 6)
      for (let i = 0; i < 4; i++) {
        if (Math.abs(sx - corners[i][0]) <= reach && Math.abs(sy - corners[i][1]) <= reach) return { kind: 'handle', corner: i, box }
      }
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return { kind: 'body' }
      return null
    }

    /** Which action a pointer press performs, taking pen buttons and modifiers into account. */
    const effectiveFor = (e: PointerEvent): Effective => {
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) return 'pan'
      if (spaceDown) return 'pan'
      if (e.pointerType === 'pen') {
        // Pen buttons, as configured in Settings → Pen buttons.
        const pb = useUI.getState().penButtons
        const act = (a: PenAction): Effective | null => (a === 'tool' ? null : a === 'eraser' ? 'eraser' : a)
        let mapped: Effective | null = null
        if (e.button === 5 || (e.buttons & 32) !== 0) mapped = act(pb.eraserEnd)
        else if (e.button === 2 || (e.buttons & 2) !== 0) mapped = act(pb.lower)
        else if (e.button === 1 || (e.buttons & 4) !== 0) mapped = act(pb.upper)
        if (mapped) return mapped
      }
      return toolEffect(useUI.getState().tool)
    }

    /** Item (or its whole group) under a screen point, for hover highlight and quick move. */
    const hoverTarget = (sx: number, sy: number): { item: Item; box: BBox } | null => {
      const w = screenToWorld(editor.camera, sx, sy)
      const hit = hitTest(scene.getItems(), w.x, w.y, 6 / editor.camera.zoom)
      if (!hit) return null
      const members = hit.groupId ? scene.getItems().filter((i) => i.groupId === hit.groupId) : [hit]
      const box = { ...members[0].bbox }
      for (const m of members) {
        box.minX = Math.min(box.minX, m.bbox.minX)
        box.minY = Math.min(box.minY, m.bbox.minY)
        box.maxX = Math.max(box.maxX, m.bbox.maxX)
        box.maxY = Math.max(box.maxY, m.bbox.maxY)
      }
      return { item: hit, box }
    }
    let hoverBox: BBox | null = null

    function cursorState(): CursorState | null {
      if (!hover || spaceDown) return null
      if (gesture?.kind === 'pan' || gesture?.kind === 'pinch') return null
      const ui = useUI.getState()
      const penHover = hover.pointerType === 'pen' && hover.buttons === 0
      const eraserButton = hover.pointerType === 'pen' && (hover.buttons & 32) !== 0
      const eff = eraserButton ? 'eraser' : toolEffect(ui.tool)
      if (eff === 'pan' || eff === 'select' || eff === 'shape' || eff === 'move') return null
      // While actually inking, the ink itself is the feedback.
      if (gesture?.kind === 'ink') return null
      if (eff === 'eraser') {
        return { sx: hover.sx, sy: hover.sy, penHover, kind: 'eraser', color: '', radius: ui.eraserRadius }
      }
      const slot = ui.tool === 'highlighter' ? ui.highlighter : ui.pens[ui.activePen]
      return {
        sx: hover.sx,
        sy: hover.sy,
        penHover,
        kind: 'ink',
        color: slot.color,
        radius: (slot.size * editor.camera.zoom) / 2
      }
    }

    const updateCssCursor = (): void => {
      const tool = useUI.getState().tool
      let c = 'none'
      if (gesture?.kind === 'pan' || gesture?.kind === 'pinch') c = 'grabbing'
      else if (spaceDown || tool === 'pan') c = 'grab'
      else if (tool === 'shape') c = 'crosshair'
      else if (gesture?.kind === 'move') c = 'move'
      else if (gesture?.kind === 'scale') c = gesture.cx > gesture.ax === gesture.cy > gesture.ay ? 'nwse-resize' : 'nesw-resize'
      else if (tool === 'select' || tool === 'move') {
        const h = hover ? selectionHit(hover.sx, hover.sy) : null
        if (h) c = h.kind === 'body' ? 'move' : h.corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
        else if (hoverBox) c = 'move'
        else c = tool === 'move' ? 'grab' : 'default'
      }
      overlay.style.cursor = c
    }

    const eraseSegment = (x0: number, y0: number, x1: number, y1: number, g: Gesture & { kind: 'eraser' }): void => {
      const r = useUI.getState().eraserRadius / editor.camera.zoom
      const box = {
        minX: Math.min(x0, x1) - r,
        minY: Math.min(y0, y1) - r,
        maxX: Math.max(x0, x1) + r,
        maxY: Math.max(y0, y1) + r
      }
      // Sample along the eraser movement so fast swipes don't skip strokes.
      const dist = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(1, Math.ceil(dist / (r * 0.5)))
      const hit: StrokeItem[] = []
      for (const item of scene.getItems()) {
        // Like Whiteboard, the eraser only removes ink, never images.
        if (item.type !== 'stroke' || !bboxIntersects(item.bbox, box)) continue
        const rr = r + item.size / 2
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          if (circleHitsPolyline(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rr, item.points)) {
            hit.push(item)
            break
          }
        }
      }
      if (hit.length) {
        g.removed.push(...hit)
        scene.remove(hit, false)
      }
    }

    const pointFrom = (e: PointerEvent, pressure: boolean): Point => {
      const p = local(e)
      const w = screenToWorld(editor.camera, p.x, p.y)
      // Some tablets report 0 on the very first contact sample.
      const pr = pressure ? Math.max(0.05, e.pressure || 0.05) : 0.5
      return [w.x, w.y, pr]
    }

    const finishGesture = (): void => {
      const g = gesture
      gesture = null
      if (!g) return
      if (g.kind === 'shape') {
        let pts = g.live.points
        if (!g.moved) {
          // A plain click drops a default-size shape centred on the click.
          const d = DEFAULT_SHAPE_SIZE / editor.camera.zoom
          pts = isLinear(g.shape)
            ? shapeOutline(g.shape, g.ax - d / 2, g.ay, g.ax + d / 2, g.ay, false, g.live.size)
            : shapeOutline(g.shape, g.ax - d / 2, g.ay - d / 2, g.ax + d / 2, g.ay + d / 2, false, g.live.size)
        }
        scene.add([
          {
            type: 'stroke',
            id: newId(),
            z: scene.allocZ(),
            tool: 'pen',
            color: g.live.color,
            size: g.live.size,
            pressure: false,
            geom: 'line',
            points: pts,
            bbox: bboxOfPoints(pts, g.live.size)
          }
        ])
      } else if (g.kind === 'ink' && g.live.points.length > 0) {
        const { live } = g
        const stroke: StrokeItem = {
          type: 'stroke',
          id: newId(),
          z: scene.allocZ(),
          tool: live.tool,
          color: live.color,
          size: live.size,
          pressure: live.pressure,
          points: live.points,
          bbox: bboxOfPoints(live.points, live.size),
          ...(live.geom ? { geom: live.geom } : {})
        }
        scene.add([stroke])
      } else if (g.kind === 'eraser') {
        scene.record({ added: [], removed: g.removed })
      } else if (g.kind === 'lasso') {
        if (!g.moved) {
          // A tap selects the item under the pointer (or clears the selection).
          const w = screenToWorld(editor.camera, g.startX, g.startY)
          const hit = hitTest(scene.getItems(), w.x, w.y, 6 / editor.camera.zoom)
          if (hit) editor.setSelection([hit])
          else editor.clearSelection()
        } else {
          editor.setSelection(itemsInLasso(scene.getItems(), g.points))
        }
      } else if (g.kind === 'move' || g.kind === 'scale') {
        editor.commitPreview()
      }
      updateCssCursor()
      invalidate(false)
    }

    // ---------- touch (pan / pinch) ----------
    const touchCentroid = (): { cx: number; cy: number; dist: number } => {
      const pts = [...touches.values()]
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
      return { cx, cy, dist }
    }

    const onTouchDown = (e: PointerEvent): void => {
      if (performance.now() - lastPenTime < PALM_REJECT_MS || gesture?.kind === 'ink' || gesture?.kind === 'eraser')
        return
      const p = local(e)
      touches.set(e.pointerId, p)
      capture(e.pointerId)
      if (touches.size === 1) {
        gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
      } else if (touches.size === 2) {
        const c = touchCentroid()
        gesture = { kind: 'pinch', dist: c.dist, cx: c.cx, cy: c.cy }
      }
    }

    const onTouchMove = (e: PointerEvent): void => {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, local(e))
      if (gesture?.kind === 'pinch' && touches.size >= 2) {
        const c = touchCentroid()
        let cam = editor.camera
        if (gesture.dist > 0 && c.dist > 0) cam = zoomAt(cam, gesture.cx, gesture.cy, cam.zoom * (c.dist / gesture.dist))
        cam = panBy(cam, c.cx - gesture.cx, c.cy - gesture.cy)
        gesture = { kind: 'pinch', dist: c.dist, cx: c.cx, cy: c.cy }
        editor.setCamera(cam)
      } else if (gesture?.kind === 'pan' && gesture.pointerId === e.pointerId) {
        const p = local(e)
        editor.setCamera(panBy(editor.camera, p.x - gesture.lastX, p.y - gesture.lastY))
        gesture.lastX = p.x
        gesture.lastY = p.y
      }
    }

    const onTouchUp = (e: PointerEvent): void => {
      if (!touches.delete(e.pointerId)) return
      if (touches.size === 1 && gesture?.kind === 'pinch') {
        // Continue as a one-finger pan with the remaining finger.
        const [id, p] = [...touches.entries()][0]
        gesture = { kind: 'pan', pointerId: id, lastX: p.x, lastY: p.y }
      } else if (touches.size === 0) {
        gesture = null
      }
    }

    // ---------- pointer events ----------
    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return onTouchDown(e)
      if (gesture) return
      if (e.pointerType === 'pen') lastPenTime = performance.now()
      e.preventDefault()
      capture(e.pointerId)
      const p = local(e)
      const eff = effectiveFor(e)

      if (eff === 'move') {
        // Quick move: grab whatever is under the pointer (or the current selection) and drag it.
        const w = screenToWorld(editor.camera, p.x, p.y)
        const h = selectionHit(p.x, p.y)
        const target = h ? null : hoverTarget(p.x, p.y)
        if (h || target) {
          if (target) editor.setSelection([target.item])
          gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
        } else {
          // Empty space: drag the board instead.
          editor.clearSelection()
          gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
        }
        hoverBox = null
      } else if (eff === 'pan') {
        gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
      } else if (eff === 'select') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const h = selectionHit(p.x, p.y)
        if (h?.kind === 'handle') {
          // Scale uniformly about the opposite corner.
          const b = h.box
          const xs = [b.minX, b.maxX, b.maxX, b.minX]
          const ys = [b.minY, b.minY, b.maxY, b.maxY]
          const o = (h.corner + 2) % 4
          gesture = { kind: 'scale', pointerId: e.pointerId, ax: xs[o], ay: ys[o], cx: xs[h.corner], cy: ys[h.corner] }
        } else if (h?.kind === 'body') {
          gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
        } else {
          // Pressing on a highlighted item grabs it right away; empty space starts a lasso.
          const hit = hitTest(scene.getItems(), w.x, w.y, 6 / editor.camera.zoom)
          if (hit && (e.pointerType !== 'pen' || hoverBox)) {
            editor.setSelection([hit])
            gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
          } else {
            gesture = { kind: 'lasso', pointerId: e.pointerId, points: [[w.x, w.y]], startX: p.x, startY: p.y, moved: false }
          }
        }
      } else if (eff === 'shape') {
        editor.clearSelection()
        const ui = useUI.getState()
        const w = screenToWorld(editor.camera, p.x, p.y)
        const slot = ui.pens[ui.activePen]
        gesture = {
          kind: 'shape',
          pointerId: e.pointerId,
          shape: ui.shape,
          ax: w.x,
          ay: w.y,
          sx: p.x,
          sy: p.y,
          moved: false,
          live: { tool: 'pen', color: slot.color, size: slot.size, pressure: false, geom: 'line', points: [] }
        }
      } else if (eff === 'eraser') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const g: Gesture = { kind: 'eraser', pointerId: e.pointerId, removed: [], lastX: w.x, lastY: w.y }
        gesture = g
        eraseSegment(w.x, w.y, w.x, w.y, g)
      } else {
        editor.clearSelection()
        const ui = useUI.getState()
        const isHl = ui.tool === 'highlighter'
        const slot = isHl ? ui.highlighter : ui.pens[ui.activePen]
        const pressure = e.pointerType === 'pen' && !isHl
        const start = pointFrom(e, pressure)
        gesture = {
          kind: 'ink',
          pointerId: e.pointerId,
          start,
          live: { tool: isHl ? 'highlighter' : 'pen', color: slot.color, size: slot.size, pressure, points: [start] }
        }
        // Shift held from the start: straight line.
        if (e.shiftKey) gesture.live = { ...gesture.live, geom: 'line', pressure: false }
      }
      hover = { sx: p.x, sy: p.y, pointerType: e.pointerType, buttons: e.buttons }
      updateCssCursor()
      invalidate(false)
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return onTouchMove(e)
      if (e.pointerType === 'pen') lastPenTime = performance.now()
      const p = local(e)
      hover = { sx: p.x, sy: p.y, pointerType: e.pointerType, buttons: e.buttons }

      const g = gesture
      if (g && 'pointerId' in g && g.pointerId === e.pointerId) {
        if (g.kind === 'pan') {
          editor.setCamera(panBy(editor.camera, p.x - g.lastX, p.y - g.lastY))
          g.lastX = p.x
          g.lastY = p.y
        } else if (g.kind === 'lasso') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          g.points.push([w.x, w.y])
          if (Math.hypot(p.x - g.startX, p.y - g.startY) > 4) g.moved = true
        } else if (g.kind === 'move') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          editor.setPreview({ s: 1, ax: 0, ay: 0, dx: w.x - g.startX, dy: w.y - g.startY })
        } else if (g.kind === 'scale') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const vx = g.cx - g.ax
          const vy = g.cy - g.ay
          const len2 = vx * vx + vy * vy || 1
          const s = Math.max(0.05, ((w.x - g.ax) * vx + (w.y - g.ay) * vy) / len2)
          editor.setPreview({ s, ax: g.ax, ay: g.ay, dx: 0, dy: 0 })
        } else {
          // Coalesced events give every sample the tablet produced (often 200+ Hz), not just one per frame.
          const samples = e.getCoalescedEvents?.() ?? []
          const events = samples.length ? samples : [e]
          if (g.kind === 'ink') {
            if (e.shiftKey || g.live.geom === 'line') {
              // Shift = straight line from where the stroke started (snaps to 0°/45°/90°).
              const w = screenToWorld(editor.camera, p.x, p.y)
              const [ex, ey] = snapAngle(g.start[0], g.start[1], w.x, w.y)
              g.live = { ...g.live, geom: 'line', pressure: false, points: [[g.start[0], g.start[1], 0.5], [ex, ey, 0.5]] }
            } else {
              for (const ev of events) g.live.points.push(pointFrom(ev, g.live.pressure))
            }
          } else if (g.kind === 'shape') {
            const w = screenToWorld(editor.camera, p.x, p.y)
            if (Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true
            if (g.moved) g.live.points = shapeOutline(g.shape, g.ax, g.ay, w.x, w.y, e.shiftKey, g.live.size)
          } else if (g.kind === 'eraser') {
            for (const ev of events) {
              const lp = local(ev)
              const w = screenToWorld(editor.camera, lp.x, lp.y)
              eraseSegment(g.lastX, g.lastY, w.x, w.y, g)
              g.lastX = w.x
              g.lastY = w.y
            }
          }
        }
      }
      if (!gesture) {
        // Hover highlight in select / move mode (not over the current selection's frame).
        const tool = useUI.getState().tool
        const prev = hoverBox
        hoverBox =
          (tool === 'select' || tool === 'move') && !spaceDown && !selectionHit(p.x, p.y) ? (hoverTarget(p.x, p.y)?.box ?? null) : null
        if (prev !== hoverBox || tool === 'select' || tool === 'move') updateCssCursor()
      }
      invalidate(false)
    }

    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return onTouchUp(e)
      const g = gesture
      if (g && 'pointerId' in g && g.pointerId === e.pointerId) finishGesture()
      if (e.pointerType === 'pen') lastPenTime = performance.now()
    }

    const onPointerLeave = (e: PointerEvent): void => {
      // Pen left the tablet's detection range (or the mouse left the window).
      if (e.pointerType !== 'touch' && !gesture) {
        hover = null
        hoverBox = null
        invalidate(false)
      }
    }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const p = local(e)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      if (e.ctrlKey || e.metaKey) {
        // Ctrl + wheel, or touchpad pinch (Chromium reports it as ctrl+wheel).
        editor.setCamera(zoomAt(editor.camera, p.x, p.y, editor.camera.zoom * Math.exp(-dy * 0.0025)))
      } else if (e.shiftKey && dx === 0) {
        editor.setCamera(panBy(editor.camera, -dy, 0))
      } else {
        editor.setCamera(panBy(editor.camera, -dx, -dy))
      }
    }

    // ---------- keyboard ----------
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      const ui = useUI.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // App-wide shortcuts (also on the home screen).
      if (mod && key === 'n') return e.preventDefault(), void editor.newBoard()
      if (mod && key === 'o') return e.preventDefault(), void editor.openFile()
      if (ui.view !== 'board') return
      if (mod && key === 'h') return e.preventDefault(), void editor.goHome()
      if (mod && key === 's') return e.preventDefault(), void (e.shiftKey ? editor.saveAsFile() : editor.save())
      if (e.code === 'Space') {
        e.preventDefault()
        if (!spaceDown) {
          spaceDown = true
          updateCssCursor()
          invalidate(false)
        }
        return
      }
      if (mod && key === 'z' && !e.shiftKey) return e.preventDefault(), editor.undo()
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) return e.preventDefault(), editor.redo()
      if (mod && (key === '=' || key === '+')) return e.preventDefault(), editor.zoomStep(1)
      if (mod && key === '-') return e.preventDefault(), editor.zoomStep(-1)
      if (mod && key === '0') return e.preventDefault(), editor.resetZoom()
      if (mod && key === 'a') return e.preventDefault(), editor.selectAll()
      if (mod && key === 'd') return e.preventDefault(), editor.duplicateSelection()
      if (mod && key === 'g' && e.shiftKey) return e.preventDefault(), editor.ungroupSelection()
      if (mod && key === 'g') return e.preventDefault(), editor.groupSelection()
      if (mod) return
      if (key === 'delete' || key === 'backspace') return e.preventDefault(), editor.deleteSelection()
      if (key === 'escape') return editor.clearSelection()
      if (key === 'v') return ui.setTool('select')
      if (key === 'm') return ui.setTool('move')
      // X: quick swap between the current pen and the eraser (handy on a tablet ExpressKey).
      if (key === 'x') return ui.tool === 'eraser' ? ui.selectPen(ui.activePen) : ui.setTool('eraser')
      if (key === 'p') ui.selectPen(ui.activePen)
      else if (key === 'h') ui.setTool('highlighter')
      else if (key === 'e') ui.setTool('eraser')
      else if (['1', '2', '3'].includes(key)) ui.selectPen(Number(key) - 1)
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceDown = false
        updateCssCursor()
        invalidate(false)
      }
    }

    // ---------- images: paste & drag-and-drop ----------
    const onPaste = (e: ClipboardEvent): void => {
      if (isTyping(e.target) || useUI.getState().view !== 'board') return
      if (editor.pasteFromClipboard(e)) e.preventDefault()
    }
    const onCopy = (e: ClipboardEvent): void => {
      if (!isTyping(e.target) && editor.copyToClipboard(e, false)) e.preventDefault()
    }
    const onCut = (e: ClipboardEvent): void => {
      if (!isTyping(e.target) && editor.copyToClipboard(e, true)) e.preventDefault()
    }
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      // Always prevent default, otherwise Electron navigates to the dropped file.
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])]
      if (!files.length || useUI.getState().view !== 'board') return
      const p = local(e)
      void editor.insertImages(files, p.x, p.y)
    }

    // ---------- sizing ----------
    const ro = new ResizeObserver(() => {
      const r = overlay.parentElement!.getBoundingClientRect()
      editor.viewport = { width: r.width, height: r.height }
      renderer.resize(r.width, r.height, window.devicePixelRatio || 1)
      invalidate(true)
    })
    ro.observe(overlay.parentElement!)

    const unsubTool = useUI.subscribe((s, prev) => {
      if (s.tool !== prev.tool) hoverBox = null
      // Items changed under the pointer (delete, undo…): drop a stale highlight.
      if (s.sceneVersion !== prev.sceneVersion && !gesture) hoverBox = null
      if (s.tool !== prev.tool) updateCssCursor()
    })

    const preventMenu = (e: Event): void => e.preventDefault()
    overlay.addEventListener('pointerdown', onPointerDown)
    overlay.addEventListener('pointermove', onPointerMove)
    overlay.addEventListener('pointerup', onPointerUp)
    overlay.addEventListener('pointercancel', onPointerUp)
    overlay.addEventListener('pointerleave', onPointerLeave)
    overlay.addEventListener('wheel', onWheel, { passive: false })
    overlay.addEventListener('contextmenu', preventMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('paste', onPaste)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    updateCssCursor()

    return () => {
      ro.disconnect()
      unsubTool()
      detach()
      cancelAnimationFrame(raf)
      overlay.removeEventListener('pointerdown', onPointerDown)
      overlay.removeEventListener('pointermove', onPointerMove)
      overlay.removeEventListener('pointerup', onPointerUp)
      overlay.removeEventListener('pointercancel', onPointerUp)
      overlay.removeEventListener('pointerleave', onPointerLeave)
      overlay.removeEventListener('wheel', onWheel)
      overlay.removeEventListener('contextmenu', preventMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="board">
      <canvas ref={baseRef} className="board-canvas" />
      <canvas ref={overlayRef} className="board-canvas board-overlay" />
    </div>
  )
}
