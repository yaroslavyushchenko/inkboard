import { useEffect, useRef } from 'react'
import { panBy, screenToWorld, zoomAt } from '../engine/camera'
import { bboxIntersects, bboxOfPoints, circleHitsPolyline, newId } from '../engine/geometry'
import { setImageLoadListener } from '../engine/images'
import { BoardRenderer, type CursorState, type LiveStroke } from '../engine/renderer'
import type { Item, Point, StrokeItem } from '../engine/types'
import { editor } from '../editor'
import { useUI, type Tool } from '../store'

type Effective = 'ink' | 'eraser' | 'pan'

type Gesture =
  | { kind: 'ink'; pointerId: number; live: LiveStroke }
  | { kind: 'eraser'; pointerId: number; removed: Item[]; lastX: number; lastY: number }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'pinch'; dist: number; cx: number; cy: number }

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
      if (baseDirty) renderer.renderBase(scene.getItems(), editor.camera, ui.background)
      if (overlayDirty) {
        const live = gesture?.kind === 'ink' ? gesture.live : null
        renderer.renderOverlay(live, cursorState(), editor.camera)
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
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = overlay.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const toolEffect = (tool: Tool): Effective =>
      tool === 'eraser' ? 'eraser' : tool === 'pan' ? 'pan' : 'ink'

    /** Which action a pointer press performs, taking pen buttons and modifiers into account. */
    const effectiveFor = (e: PointerEvent): Effective => {
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) return 'pan'
      if (spaceDown) return 'pan'
      if (e.pointerType === 'pen') {
        // Eraser end of the pen (button 5 / buttons bit 32) or the barrel button.
        if (e.button === 5 || (e.buttons & 32) !== 0 || e.button === 2) return 'eraser'
      }
      return toolEffect(useUI.getState().tool)
    }

    function cursorState(): CursorState | null {
      if (!hover || spaceDown) return null
      if (gesture?.kind === 'pan' || gesture?.kind === 'pinch') return null
      const ui = useUI.getState()
      const penHover = hover.pointerType === 'pen' && hover.buttons === 0
      const eraserButton = hover.pointerType === 'pen' && (hover.buttons & 32) !== 0
      const eff = eraserButton ? 'eraser' : toolEffect(ui.tool)
      if (eff === 'pan') return null
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
      if (g.kind === 'ink' && g.live.points.length > 0) {
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
          bbox: bboxOfPoints(live.points, live.size)
        }
        scene.add([stroke])
      } else if (g.kind === 'eraser') {
        scene.record({ added: [], removed: g.removed })
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
      overlay.setPointerCapture(e.pointerId)
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
      overlay.setPointerCapture(e.pointerId)
      const p = local(e)
      const eff = effectiveFor(e)

      if (eff === 'pan') {
        gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
      } else if (eff === 'eraser') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const g: Gesture = { kind: 'eraser', pointerId: e.pointerId, removed: [], lastX: w.x, lastY: w.y }
        gesture = g
        eraseSegment(w.x, w.y, w.x, w.y, g)
      } else {
        const ui = useUI.getState()
        const isHl = ui.tool === 'highlighter'
        const slot = isHl ? ui.highlighter : ui.pens[ui.activePen]
        const pressure = e.pointerType === 'pen' && !isHl
        gesture = {
          kind: 'ink',
          pointerId: e.pointerId,
          live: { tool: isHl ? 'highlighter' : 'pen', color: slot.color, size: slot.size, pressure, points: [pointFrom(e, pressure)] }
        }
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
        } else {
          // Coalesced events give every sample the tablet produced (often 200+ Hz), not just one per frame.
          const samples = e.getCoalescedEvents?.() ?? []
          const events = samples.length ? samples : [e]
          if (g.kind === 'ink') {
            for (const ev of events) g.live.points.push(pointFrom(ev, g.live.pressure))
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
      if (mod) return
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
      if (isTyping(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void editor.insertImages(files)
      }
    }
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      // Always prevent default, otherwise Electron navigates to the dropped file.
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])]
      if (!files.length) return
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
