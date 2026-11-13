import { useEffect, useRef } from 'react'
import { panBy, screenToWorld, zoomAt } from '../engine/camera'
import { bboxIntersects, bboxOfPoints, circleHitsPolyline, newId } from '../engine/geometry'
import { setImageLoadListener } from '../engine/images'
import {
  BoardRenderer,
  END_HANDLE_R,
  HANDLE_SIZE,
  selectionCorners,
  selectionScreenRect,
  selectionSides,
  type CursorState,
  type LiveStroke
} from '../engine/renderer'
import { arcStroke, baseStroke, degText, hitProtractor, rayStroke, scaleAngle, snapDeg, toLocal, toWorld, type ProtractorHit, type ProtractorState } from '../engine/protractor'
import { buildShapeItems, editableShape, regenerateShape, shapeMembers } from '../engine/shapeItems'
import { DEFAULT_SHAPE_SIZE, isLinear, SHAPE_BASES, shapeBox, shapeParts, snapAngle, type ShapeKind } from '../engine/shapes'
import { hitTest, itemsInLasso } from '../engine/transform'
import type { BBox, Item, Point, ShapeSpec, StrokeItem, TextItem } from '../engine/types'
import { editor } from '../editor'
import { isBoardFileShortcut, matchShortcut, type BoardFileShortcut, type ShortcutId } from '../shortcuts'
import { useUI, type InkSlot, type PenAction, type Tool } from '../store'
import { translate, type Lang, type MessageKey } from '../i18n'
import { BACKGROUND_STYLE } from '../engine/background'
import { bgPattern } from '../engine/surface'
import { COMPASS_CELL, compassArc, hitCompass, radiusCells, radiusFromHandle, snapSweep, type CompassHit, type CompassState } from '../engine/compass'
import {
  cmText,
  edgeOf,
  edgePos,
  edgeStroke,
  hitStraightedge,
  rotateFromHandle,
  snapStraightedgeToGrid,
  type StraightHit,
  type StraightState
} from '../engine/straightedge'
import { textBBox } from '../engine/text'

type StraightSlot = 'ruler' | 'setSquare'

/** "r = 4 cells" / "r = 4,5 клітинки" for the compass. */
function radiusLabel(lang: Lang, r: number): string {
  const { n, form } = radiusCells(r)
  const num = lang === 'uk' ? String(n).replace('.', ',') : String(n)
  // English: only exactly 1 is singular.
  const f = lang === 'en' ? (n === 1 ? 'cell1' : 'cellMany') : form
  return translate(lang, 'compass.radius', { n: num, unit: translate(lang, `compass.${f}`) })
}

type Effective = 'ink' | 'eraser' | 'pan' | 'select' | 'brush' | 'shape' | 'move' | 'text'

type Gesture =
  | {
      kind: 'ink'
      pointerId: number
      live: LiveStroke
      start: Point
      snap?:
        | { mode: 'arc'; startDeg: number; endDeg?: number }
        | { mode: 'center' }
        | { mode: 'base'; u0: number }
        | { mode: 'compass'; a0: number; last: number; sweep: number }
        | { mode: 'straight'; slot: StraightSlot; edge: number; d0: number }
    }
  | { kind: 'protMove'; pointerId: number; ox: number; oy: number }
  | { kind: 'protRotate'; pointerId: number }
  | { kind: 'straightMove'; slot: StraightSlot; pointerId: number; ox: number; oy: number }
  | { kind: 'straightRotate'; slot: StraightSlot; pointerId: number }
  | { kind: 'compMove'; pointerId: number; ox: number; oy: number }
  | { kind: 'compRadius'; pointerId: number }
  | {
      kind: 'shape'
      pointerId: number
      shape: ShapeKind
      base?: number
      ax: number
      ay: number
      bx: number
      by: number
      keep: boolean
      sx: number
      sy: number
      moved: boolean
      live: LiveStroke
    }
  | { kind: 'endpoint'; pointerId: number; original: StrokeItem; current: StrokeItem; which: 0 | 1 }
  | {
      kind: 'reshape'
      pointerId: number
      side: number
      spec: ShapeSpec
      parts: StrokeItem[]
      current: StrokeItem[]
      inUserGroup: boolean
      startX: number
      startY: number
    }
  | { kind: 'eraser'; pointerId: number; removed: Item[]; lastX: number; lastY: number }
  | { kind: 'brush'; pointerId: number; lastX: number; lastY: number; remove: boolean; touched: boolean; moved: boolean; sx: number; sy: number }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'pinch'; dist: number; cx: number; cy: number }
  | { kind: 'lasso'; pointerId: number; points: [number, number][]; startX: number; startY: number; moved: boolean }
  | { kind: 'move'; pointerId: number; startX: number; startY: number }
  | { kind: 'scale'; pointerId: number; ax: number; ay: number; cx: number; cy: number }

type End = [number, number]

/** End points of a straight line that can be dragged (Shift lines, protractor rays, line / arrow shapes). */
function lineEnds(it: Item): [End, End] | null {
  if (it.type !== 'stroke' || it.locked) return null
  if (it.shape) return isLinear(it.shape.kind) ? [[it.shape.ax, it.shape.ay], [it.shape.bx, it.shape.by]] : null
  if (it.geom === 'line' && it.points.length === 2) return [[it.points[0][0], it.points[0][1]], [it.points[1][0], it.points[1][1]]]
  return null
}

type SelHit =
  | { kind: 'handle'; corner: number; box: BBox }
  | { kind: 'side'; side: number }
  | { kind: 'end'; which: 0 | 1; item: StrokeItem }
  | { kind: 'body' }

interface Hover {
  sx: number
  sy: number
  pointerType: string
  buttons: number
}

/** Ignore finger touches for this long after the pen was last seen (palm rejection). */
const PALM_REJECT_MS = 800

export type BoardFileActions = Record<BoardFileShortcut, () => unknown>

export function Board({ fileActions }: { fileActions?: BoardFileActions }) {
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
    /** Last press on a text item (for double click / double tap = edit). */
    let lastTap: { id: string; t: number } | null = null
    const touches = new Map<number, { x: number; y: number }>()

    // ---------- render loop ----------
    let baseDirty = true
    let overlayDirty = true
    let raf = 0

    const frame = (): void => {
      raf = 0
      const ui = useUI.getState()
      if (baseDirty) {
        // Text being edited is shown by the text box instead.
        const editing = ui.textEdit?.id ?? ui.formulaEdit?.id
        const items = editing ? scene.getItems().filter((i) => i.id !== editing) : scene.getItems()
        renderer.renderBase(items, editor.camera, ui.background, editor.preview)
      }
      if (overlayDirty) {
        const live = gesture?.kind === 'ink' || gesture?.kind === 'shape' ? gesture.live : null
        const info = selInfo()
        const hl = !gesture && hoverLine && hoverLine.id !== info?.line?.id ? hoverLine : null
        const comp = ui.compass
        const cs = comp ? compassState() : null
        const prot = ui.protractor
        const ps = prot ? protractorState() : null
        const sq = ui.setSquare
        const ss = sq ? straightState('setSquare') : null
        const rul = ui.ruler
        const rs = rul ? straightState('ruler') : null
        const hintText = cs?.hint || ps?.hint || ss?.hint || rs?.hint
        renderer.renderOverlay(live, cursorState(), editor.camera, {
          box: info?.box ?? null,
          lasso: gesture?.kind === 'lasso' ? gesture.points : null,
          hover: gesture ? null : hoverBox,
          locked: info?.locked,
          corners: !info?.line,
          sides: !!info?.shape,
          ends: info?.line ? lineEnds(info.line) : hl ? lineEnds(hl) : null
        }, {
          ruler: rul ? { s: rul, state: rs!.state } : null,
          setSquare: sq ? { s: sq, state: ss!.state } : null,
          protractor: prot ? { p: prot, state: ps!.state } : null,
          compass: comp ? { c: comp, color: inkSlot().color, label: radiusLabel(ui.lang, comp.r), state: cs!.state } : null,
          hint: hover && hintText ? { sx: hover.sx, sy: hover.sy, text: hintText } : null,
          angleLabel
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
        // Pointer already gone (or a synthetic event); capture is best-effort.
      }
    }
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = overlay.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const toolEffect = (tool: Tool): Effective =>
      tool === 'eraser'
        ? 'eraser'
        : tool === 'pan'
          ? 'pan'
          : tool === 'select'
            ? 'select'
            : tool === 'brushSelect'
              ? 'brush'
            : tool === 'shape'
              ? 'shape'
              : tool === 'move'
                ? 'move'
                : tool === 'text'
                  ? 'text'
                  : 'ink'

    /** The current selection, with what can be done to it. */
    const selInfo = (): {
      box: BBox
      locked: boolean
      line: StrokeItem | null
      shape: { spec: ShapeSpec; parts: StrokeItem[] } | null
    } | null => {
      if (!useUI.getState().selectedIds.length) return null
      const items = editor.selectedItems()
      const box = editor.selectionBBox()
      if (!box || !items.length) return null
      const locked = items.some((i) => i.locked)
      const line = items.length === 1 && !locked && lineEnds(items[0]) ? (items[0] as StrokeItem) : null
      const es = locked || line ? null : editableShape(items)
      return { box, locked, line, shape: es && !isLinear(es.spec.kind) ? es : null }
    }

    const reach = (): number => (hover?.pointerType === 'mouse' ? 0 : 6)
    const nearEnd = (item: StrokeItem, sx: number, sy: number): 0 | 1 | null => {
      const ends = lineEnds(item)
      if (!ends) return null
      const cam = editor.camera
      for (const which of [0, 1] as const) {
        const ex = (ends[which][0] - cam.x) * cam.zoom
        const ey = (ends[which][1] - cam.y) * cam.zoom
        if (Math.hypot(sx - ex, sy - ey) <= END_HANDLE_R + 4 + reach()) return which
      }
      return null
    }

    /** What a press at screen point (sx, sy) would grab on the current selection. */
    const selectionHit = (sx: number, sy: number): SelHit | null => {
      const info = selInfo()
      if (!info) return null
      if (info.line) {
        const which = nearEnd(info.line, sx, sy)
        if (which !== null) return { kind: 'end', which, item: info.line }
      }
      const r = selectionScreenRect(info.box, editor.camera)
      const near = (pt: [number, number]): boolean =>
        Math.abs(sx - pt[0]) <= HANDLE_SIZE + reach() && Math.abs(sy - pt[1]) <= HANDLE_SIZE + reach()
      if (!info.locked && !info.line) {
        const corners = selectionCorners(r)
        for (let i = 0; i < 4; i++) if (near(corners[i])) return { kind: 'handle', corner: i, box: info.box }
      }
      if (info.shape) {
        const sides = selectionSides(r)
        for (let i = 0; i < 4; i++) if (near(sides[i])) return { kind: 'side', side: i }
      }
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return { kind: 'body' }
      return null
    }

    /** A lone straight line under the pointer (its ends can be grabbed without selecting it first). */
    const lineAt = (sx: number, sy: number): StrokeItem | null => {
      const t = hoverTarget(sx, sy)
      return t && !t.item.groupId && lineEnds(t.item) ? (t.item as StrokeItem) : null
    }
    let hoverLine: StrokeItem | null = null

    /** End point of the hovered line under (sx, sy). */
    const hoverEndAt = (sx: number, sy: number): { which: 0 | 1; item: StrokeItem } | null => {
      for (const cand of [hoverLine, lineAt(sx, sy)]) {
        if (!cand || !scene.getById([cand.id]).length) continue
        const which = nearEnd(cand, sx, sy)
        if (which !== null) return { which, item: scene.getById([cand.id])[0] as StrokeItem }
      }
      return null
    }

    /** Is the item (or its group) locked? */
    const isLocked = (item: Item): boolean =>
      item.groupId ? scene.getItems().some((i) => i.groupId === item.groupId && i.locked) : !!item.locked

    /** Which action a pointer press performs, taking pen buttons and modifiers into account. */
    const effectiveFor = (e: PointerEvent): Effective => {
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) return 'pan'
      if (spaceDown) return 'pan'
      if (e.pointerType === 'pen') {
        // Pen buttons, as configured in Settings → Pen buttons.
        const pb = useUI.getState().penButtons
        const act = (a: PenAction): Effective | null => (a === 'tool' ? null : a)
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
    let angleLabel: { sx: number; sy: number; text: string } | null = null

    /** Grid spacing for Ctrl-snapping instruments to the paper grid. */
    const gridSteps = (): [number, number] => {
      const bg = useUI.getState().background
      return [COMPASS_CELL, bgPattern(bg) === 'lines' ? BACKGROUND_STYLE.lines.step : COMPASS_CELL]
    }
    const snapPt = (x: number, y: number): { x: number; y: number } => {
      const [sx, sy] = gridSteps()
      return { x: Math.round(x / sx) * sx, y: Math.round(y / sy) * sy }
    }

    /** What a press at screen point (sx, sy) hits on the compass, if it's shown. */
    const compassHitAt = (sx: number, sy: number): CompassHit | null => {
      const c = useUI.getState().compass
      if (!c) return null
      const w = screenToWorld(editor.camera, sx, sy)
      return hitCompass(c, w.x, w.y, editor.camera.zoom)
    }

    /** Open or close the settings card beside the protractor. */
    const togglePanel = (): void => {
      useUI.setState((s) => ({ protractorPanel: !s.protractorPanel }))
    }

    /** Which compass part is lit (being dragged, or under a hovering mouse / pen) and what to show with it. */
    const compassState = (): { state: CompassState; hint: string | null } => {
      const g = gesture
      const drawing = g?.kind === 'ink' && g.snap?.mode === 'compass' ? g.snap : null
      let hot: CompassHit | null = null
      if (g?.kind === 'compMove') hot = 'body'
      else if (g?.kind === 'compRadius') hot = 'radius'
      else if (drawing) hot = 'pencil'
      else if (!g && hover && hover.pointerType !== 'touch' && !spaceDown) {
        // Same rule as a press: the pan tool and the eraser go through the compass.
        const tool = useUI.getState().tool
        const eraserEnd = hover.pointerType === 'pen' && (hover.buttons & 32) !== 0
        if (tool !== 'pan' && tool !== 'eraser' && !eraserEnd) hot = compassHitAt(hover.sx, hover.sy)
      }
      const key = !g && hot ? (hot === 'pencil' || hot === 'radius' || hot === 'close' ? hot : 'move') : null
      return {
        state: { hot, sweepFrom: drawing ? drawing.a0 : null, ticks: hot === 'radius' },
        hint: key ? translate(useUI.getState().lang, `compass.hint.${key}` as MessageKey) : null
      }
    }

    /** Which protractor part is lit, the angle under the pointer on its edge, and the hint to show. */
    const protractorState = (): { state: ProtractorState; hint: string | null } => {
      const ui = useUI.getState()
      const prot = ui.protractor!
      const g = gesture
      let hot: ProtractorHit | null = null
      if (g?.kind === 'protMove') hot = 'body'
      else if (g?.kind === 'protRotate') hot = 'rotate'
      else if (g?.kind === 'ink' && g.snap && g.snap.mode !== 'compass' && g.snap.mode !== 'straight') hot = g.snap.mode
      else if (!g && hover && hover.pointerType !== 'touch' && !spaceDown && ui.tool !== 'pan') {
        // The compass lies on top: it wins, as on a press.
        if (!(ui.tool !== 'eraser' && compassHitAt(hover.sx, hover.sy))) hot = protractorHitAt(hover.sx, hover.sy)
      }
      const drawing = toolEffect(ui.tool) === 'ink'
      let hoverDeg: number | null = null
      if (hot === 'arc' && hover && (drawing || g)) {
        const w = screenToWorld(editor.camera, hover.sx, hover.sy)
        hoverDeg = snapDeg(scaleAngle(prot, w.x, w.y), ui.instruments.protStep)
      }
      let key: string | null = null
      if (!g && hot) {
        if (hot === 'close' || hot === 'rotate' || hot === 'settings') key = hot
        else if (drawing && hot !== 'body') key = hot
        else key = 'move'
      }
      return { state: { hot, hoverDeg }, hint: key ? translate(ui.lang, `protractor.hint.${key}` as MessageKey) : null }
    }

    /** The ink a pen stroke would use now (the compass pencil draws with it too). */
    const inkSlot = (): InkSlot => {
      const ui = useUI.getState()
      return ui.tool === 'highlighter' ? ui.highlighter : ui.pens[ui.activePen]
    }

    /** What a press at screen point (sx, sy) hits on the protractor, if it's shown. */
    const protractorHitAt = (sx: number, sy: number): ProtractorHit | null => {
      const prot = useUI.getState().protractor
      if (!prot) return null
      const w = screenToWorld(editor.camera, sx, sy)
      return hitProtractor(prot, w.x, w.y, editor.camera.zoom)
    }

    /** What a press at screen point (sx, sy) hits on the ruler or set square, if shown. */
    const straightHitAt = (slot: StraightSlot, sx: number, sy: number): StraightHit | null => {
      const s = useUI.getState()[slot]
      if (!s) return null
      const w = screenToWorld(editor.camera, sx, sy)
      return hitStraightedge(s, w.x, w.y, editor.camera.zoom)
    }

    /** Which part of the ruler / set square is lit, the scale mark under the pointer, and the hint to show. */
    const straightState = (slot: StraightSlot): { state: StraightState; hint: string | null } => {
      const ui = useUI.getState()
      const s = ui[slot]!
      const g = gesture
      let hot: StraightHit | null = null
      if (g?.kind === 'straightMove' && g.slot === slot) hot = 'body'
      else if (g?.kind === 'straightRotate' && g.slot === slot) hot = 'rotate'
      else if (g?.kind === 'ink' && g.snap?.mode === 'straight' && g.snap.slot === slot) hot = `edge${g.snap.edge}`
      else if (!g && hover && hover.pointerType !== 'touch' && !spaceDown && ui.tool !== 'pan') {
        const covered =
          (ui.tool !== 'eraser' && compassHitAt(hover.sx, hover.sy)) ||
          protractorHitAt(hover.sx, hover.sy) ||
          (slot === 'ruler' && straightHitAt('setSquare', hover.sx, hover.sy))
        if (!covered) hot = straightHitAt(slot, hover.sx, hover.sy)
      }
      const drawing = toolEffect(ui.tool) === 'ink'
      const edge = edgeOf(hot)
      let mark: number | null = null
      if (edge !== null && hover && (drawing || g)) {
        const w = screenToWorld(editor.camera, hover.sx, hover.sy)
        mark = edgePos(s, edge, w.x, w.y)
      }
      let hint: string | null = null
      if (!g && hot) {
        if (hot === 'close') hint = translate(ui.lang, 'straight.hint.close')
        else if (hot === 'rotate') hint = translate(ui.lang, 'protractor.hint.rotate')
        else if (edge !== null && drawing) hint = translate(ui.lang, 'protractor.hint.base')
        else hint = translate(ui.lang, 'protractor.hint.move')
      }
      return { state: { hot, mark }, hint }
    }

    function cursorState(): CursorState | null {
      if (!hover || spaceDown) return null
      if (gesture?.kind === 'pan' || gesture?.kind === 'pinch') return null
      const ui = useUI.getState()
      const penHover = hover.pointerType === 'pen' && hover.buttons === 0
      const eraserButton = hover.pointerType === 'pen' && (hover.buttons & 32) !== 0
      const eff = eraserButton ? 'eraser' : toolEffect(ui.tool)
      if (eff === 'pan' || eff === 'select' || eff === 'shape' || eff === 'move' || eff === 'text') return null
      // While actually inking, the ink itself is the feedback.
      if (gesture?.kind === 'ink') return null
      if (eff === 'eraser') {
        return { sx: hover.sx, sy: hover.sy, penHover, kind: 'eraser', color: '', radius: ui.eraserRadius }
      }
      if (eff === 'brush') {
        // Over a resize handle the normal cursor shows instead.
        if (!gesture && selectionHit(hover.sx, hover.sy)?.kind === 'handle') return null
        return { sx: hover.sx, sy: hover.sy, penHover, kind: 'select', color: '', radius: ui.selectRadius }
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
      // Protractor / straightedge part under a hovering pointer, hit-tested once (null while a gesture runs).
      const pHit = !gesture && hover ? protractorHitAt(hover.sx, hover.sy) : null
      const sHit = !gesture && hover && !pHit ? straightHitAt('setSquare', hover.sx, hover.sy) ?? straightHitAt('ruler', hover.sx, hover.sy) : null
      if (gesture?.kind === 'pan' || gesture?.kind === 'pinch') c = 'grabbing'
      else if (spaceDown || tool === 'pan') c = 'grab'
      else if (tool === 'shape') c = 'crosshair'
      else if (tool === 'text') c = 'text'
      else if (
        gesture?.kind === 'protMove' ||
        gesture?.kind === 'compMove' ||
        gesture?.kind === 'compRadius' ||
        gesture?.kind === 'straightMove' ||
        gesture?.kind === 'straightRotate'
      )
        c = 'grabbing'
      else if (gesture?.kind === 'ink' && gesture.snap?.mode === 'compass') c = 'grabbing'
      else if (gesture?.kind === 'protRotate') c = 'grabbing'
      else if (gesture?.kind === 'endpoint') c = 'crosshair'
      // A line end on top of the protractor wins over the protractor (same order as on press).
      else if (
        !gesture &&
        hover &&
        (tool === 'select' || tool === 'move') &&
        (selectionHit(hover.sx, hover.sy)?.kind === 'end' || hoverEndAt(hover.sx, hover.sy))
      )
        c = 'crosshair'
      else if (!gesture && hover && compassHitAt(hover.sx, hover.sy)) {
        const h = compassHitAt(hover.sx, hover.sy)
        c = h === 'close' ? 'pointer' : h === 'pencil' || h === 'radius' ? 'grab' : 'move'
      } else if (pHit === 'body') c = 'move'
      else if (pHit === 'rotate') c = 'grab'
      else if (pHit === 'close' || pHit === 'settings') c = 'pointer'
      else if (sHit === 'body') c = 'move'
      else if (sHit === 'rotate') c = 'grab'
      else if (sHit === 'close') c = 'pointer'
      else if (gesture?.kind === 'move') c = 'move'
      else if (gesture?.kind === 'scale') c = gesture.cx > gesture.ax === gesture.cy > gesture.ay ? 'nwse-resize' : 'nesw-resize'
      else if (gesture?.kind === 'reshape') c = gesture.side % 2 === 0 ? 'ns-resize' : 'ew-resize'
      else if (tool === 'brushSelect') {
        // The circle is drawn on the overlay; over a resize handle show the usual resize cursor.
        const h = hover ? selectionHit(hover.sx, hover.sy) : null
        if (h?.kind === 'handle' && !editor.selectionLocked()) c = h.corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
      } else if (tool === 'select' || tool === 'move') {
        const h = hover ? selectionHit(hover.sx, hover.sy) : null
        if (h?.kind === 'end') c = 'crosshair'
        else if (h?.kind === 'side') c = h.side % 2 === 0 ? 'ns-resize' : 'ew-resize'
        else if (h?.kind === 'handle') c = h.corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
        else if (h?.kind === 'body') c = editor.selectionLocked() ? 'default' : 'move'
        else if (hover && hoverEndAt(hover.sx, hover.sy)) c = 'crosshair'
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
      const hit = new Set<Item>()
      const items = scene.getItems()
      for (const item of items) {
        // Like Whiteboard, the eraser only removes ink, never images. Locked items are skipped.
        if (item.type !== 'stroke' || item.locked || hit.has(item) || !bboxIntersects(item.bbox, box)) continue
        const rr = r + item.size / 2
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          if (circleHitsPolyline(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rr, item.points)) {
            for (const m of eraseUnit(items, item)) hit.add(m)
            break
          }
        }
      }
      if (hit.size) {
        g.removed.push(...hit)
        scene.remove([...hit], false)
      }
    }

    /**
     * What one eraser touch removes: a whole shape (every edge of a solid), a group made only of
     * straight lines (older shapes), otherwise just the stroke. Nothing if any of it is locked.
     */
    const eraseUnit = (items: readonly Item[], item: StrokeItem): Item[] => {
      let unit: Item[] = [item]
      if (item.shape) unit = shapeMembers(items, item)
      else if (item.groupId) {
        const group = items.filter((i) => i.groupId === item.groupId)
        if (group.every((i) => i.type === 'stroke' && i.geom === 'line')) unit = group
      }
      return unit.some((i) => i.locked) ? [] : unit
    }

    /** A copy of a straight line with new end points (shapes are re-generated, e.g. arrow heads). */
    const withEnds = (orig: StrokeItem, a: End, b: End): StrokeItem => {
      if (orig.shape) {
        const spec = { ...orig.shape, ax: a[0], ay: a[1], bx: b[0], by: b[1] }
        return regenerateShape([orig], spec, () => scene.allocZ(), !!orig.groupId)[0]
      }
      const points: Point[] = [
        [a[0], a[1], orig.points[0][2]],
        [b[0], b[1], orig.points[1][2]]
      ]
      return { ...orig, points, bbox: bboxOfPoints(points, orig.size * 3) }
    }

    /**
     * Brush select: everything the circle touches between two board points is added to the selection
     * (whole groups), or removed from it with Ctrl / Alt held.
     */
    const brushSegment = (x0: number, y0: number, x1: number, y1: number, g: Gesture & { kind: 'brush' }): void => {
      const r = useUI.getState().selectRadius / editor.camera.zoom
      const box = { minX: Math.min(x0, x1) - r, minY: Math.min(y0, y1) - r, maxX: Math.max(x0, x1) + r, maxY: Math.max(y0, y1) + r }
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.5)))
      const hit: Item[] = []
      for (const item of scene.getItems()) {
        if (!bboxIntersects(item.bbox, box)) continue
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          const cx = x0 + (x1 - x0) * t
          const cy = y0 + (y1 - y0) * t
          const touches =
            item.type === 'stroke'
              ? circleHitsPolyline(cx, cy, r + item.size / 2, item.points)
              : cx + r >= item.bbox.minX && cx - r <= item.bbox.maxX && cy + r >= item.bbox.minY && cy - r <= item.bbox.maxY
          if (touches) {
            hit.push(item)
            break
          }
        }
      }
      if (!hit.length) return
      g.touched = true
      const current = editor.selectedItems()
      if (g.remove) {
        const gone = new Set<string>()
        for (const h of hit) {
          if (h.groupId) for (const m of scene.getItems()) if (m.groupId === h.groupId) gone.add(m.id)
          gone.add(h.id)
        }
        const next = current.filter((i) => !gone.has(i.id)).map((i) => i.id)
        if (next.length !== current.length) useUI.setState({ selectedIds: next })
      } else {
        const have = new Set(current.map((i) => i.id))
        const fresh = hit.filter((i) => !have.has(i.id))
        if (fresh.length) editor.setSelection([...current, ...fresh])
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
      angleLabel = null
      if (!g) return
      if (g.kind === 'shape') {
        let box: [number, number, number, number]
        if (g.moved) box = shapeBox(g.shape, g.ax, g.ay, g.bx, g.by, g.keep)
        else {
          // A plain click drops a default-size shape centred on the click.
          const d = DEFAULT_SHAPE_SIZE / editor.camera.zoom
          box = isLinear(g.shape) ? [g.ax - d / 2, g.ay, g.ax + d / 2, g.ay] : [g.ax - d / 2, g.ay - d / 2, g.ax + d / 2, g.ay + d / 2]
        }
        const spec: ShapeSpec = { kind: g.shape, ax: box[0], ay: box[1], bx: box[2], by: box[3], ...(g.base ? { base: g.base } : {}) }
        const { live } = g
        // Solids are several lines (visible + dashed hidden edges) kept together as one group.
        scene.add(
          buildShapeItems(
            spec,
            { color: live.color, size: live.size, tool: 'pen', dash: live.dash, startCap: live.startCap, endCap: live.endCap },
            () => ({ id: newId(), z: scene.allocZ() })
          )
        )
      } else if (g.kind === 'ink' && g.live.points.length > 0 && !(g.snap?.mode === 'compass' && Math.abs(g.snap.sweep) < 0.01)) {
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
          bbox: bboxOfPoints(live.points, live.geom ? live.size * 3 : live.size),
          ...(live.geom ? { geom: live.geom } : {}),
          ...(live.dash ? { dash: live.dash } : {}),
          // Line ends (arrow, dot…) go on freehand ink as well as straight lines.
          ...(live.startCap ? { startCap: live.startCap } : {}),
          ...(live.endCap ? { endCap: live.endCap } : {})
        }
        // An arc drawn along the protractor gets its angle written next to it ("50°"), kept with it as a group.
        const prot = useUI.getState().protractor
        const deg = g.snap?.mode === 'arc' && g.snap.endDeg !== undefined ? Math.round(Math.abs(g.snap.endDeg - g.snap.startDeg) * 10) / 10 : 0
        if (prot && deg >= 1 && g.snap?.mode === 'arc') {
          const size = Math.max(14, Math.min(48, prot.r * 0.075))
          const mid = (((g.snap.startDeg + g.snap.endDeg!) / 2) * Math.PI) / 180
          const rr = prot.r + live.size + size * 1.1
          const at = toWorld(prot, Math.cos(mid) * rr, -Math.sin(mid) * rr)
          const label: TextItem = { type: 'text', id: newId(), z: scene.allocZ(), x: 0, y: 0, text: degText(deg, useUI.getState().lang === 'uk'), size, color: live.color, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
          const b = textBBox(label)
          label.x = at.x - (b.maxX - b.minX) / 2
          label.y = at.y - (b.maxY - b.minY) / 2
          label.bbox = textBBox(label)
          const groupId = newId()
          scene.add([{ ...stroke, groupId }, { ...label, groupId }])
        } else scene.add([stroke])
      } else if (g.kind === 'brush') {
        // A tap that touches nothing clears the selection.
        if (!g.moved && !g.touched && !g.remove) editor.clearSelection()
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
      } else if (g.kind === 'endpoint') {
        if (g.current !== g.original) scene.record({ added: [g.current], removed: [g.original] })
      } else if (g.kind === 'reshape') {
        if (g.current !== g.parts) {
          scene.record({ added: g.current, removed: g.parts })
          editor.setSelection(g.current)
        }
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
      const ch = touches.size === 1 ? compassHitAt(p.x, p.y) : null
      const ph = touches.size === 1 && !ch ? protractorHitAt(p.x, p.y) : null
      const sqh = touches.size === 1 && !ch && !ph ? straightHitAt('setSquare', p.x, p.y) : null
      const rh = touches.size === 1 && !ch && !ph && !sqh ? straightHitAt('ruler', p.x, p.y) : null
      const shSlot: StraightSlot | null = sqh ? 'setSquare' : rh ? 'ruler' : null
      const sh = sqh ?? rh
      if (ph === 'settings') {
        togglePanel()
      } else if (ch === 'needle' || ch === 'body') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const c = useUI.getState().compass!
        gesture = { kind: 'compMove', pointerId: e.pointerId, ox: c.x - w.x, oy: c.y - w.y }
      } else if (ph && ph !== 'close' && ph !== 'rotate') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const prot = useUI.getState().protractor!
        gesture = { kind: 'protMove', pointerId: e.pointerId, ox: prot.x - w.x, oy: prot.y - w.y }
      } else if (shSlot && sh && sh !== 'close' && sh !== 'rotate') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const s = useUI.getState()[shSlot]!
        gesture = { kind: 'straightMove', slot: shSlot, pointerId: e.pointerId, ox: s.x - w.x, oy: s.y - w.y }
      } else if (touches.size === 1) {
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
      } else if (gesture?.kind === 'compMove' && gesture.pointerId === e.pointerId) {
        const w = screenToWorld(editor.camera, local(e).x, local(e).y)
        const c = useUI.getState().compass
        if (c) useUI.setState({ compass: { ...c, x: w.x + gesture.ox, y: w.y + gesture.oy } })
      } else if (gesture?.kind === 'protMove' && gesture.pointerId === e.pointerId) {
        const w = screenToWorld(editor.camera, local(e).x, local(e).y)
        const prot = useUI.getState().protractor
        if (prot) useUI.setState({ protractor: { ...prot, x: w.x + gesture.ox, y: w.y + gesture.oy } })
      } else if (gesture?.kind === 'straightMove' && gesture.pointerId === e.pointerId) {
        const w = screenToWorld(editor.camera, local(e).x, local(e).y)
        const s = useUI.getState()[gesture.slot]
        if (s) useUI.setState({ [gesture.slot]: { ...s, x: w.x + gesture.ox, y: w.y + gesture.oy } })
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
      // The same pen / mouse pressing again means we missed its release: end that gesture first.
      if (gesture && 'pointerId' in gesture && gesture.pointerId === e.pointerId) finishGesture()
      if (gesture) return
      if (e.pointerType === 'pen') lastPenTime = performance.now()
      e.preventDefault()
      // A press anywhere on the board finishes the text being typed (that press does nothing else in text mode).
      if (useUI.getState().textEdit) {
        editor.commitText()
        if (useUI.getState().tool === 'text' && e.button === 0) return
      }
      // The same for a formula being built.
      editor.commitFormula(false)
      capture(e.pointerId)
      const p = local(e)
      const eff = effectiveFor(e)

      // Line end points win over the protractor: a ray drawn from its centre must stay adjustable.
      const selH = eff === 'select' || eff === 'move' ? selectionHit(p.x, p.y) : null
      const endGrab = selH?.kind === 'end' ? selH : eff === 'select' || eff === 'move' ? hoverEndAt(p.x, p.y) : null
      // The compass lies on top of the protractor; with the eraser its pencil would only get in the way.
      const cHit = eff === 'pan' || eff === 'eraser' || endGrab ? null : compassHitAt(p.x, p.y)
      const pHit = eff === 'pan' || endGrab || cHit ? null : protractorHitAt(p.x, p.y)
      const sqHit = eff === 'pan' || endGrab || cHit || pHit ? null : straightHitAt('setSquare', p.x, p.y)
      const rHit = eff === 'pan' || endGrab || cHit || pHit || sqHit ? null : straightHitAt('ruler', p.x, p.y)
      const sSlot: StraightSlot | null = sqHit ? 'setSquare' : rHit ? 'ruler' : null
      const sHit = sqHit ?? rHit
      const protGrab = pHit === 'body' || (pHit !== null && pHit !== 'close' && pHit !== 'rotate' && pHit !== 'settings' && eff !== 'ink')
      const straightGrab = sHit === 'body' || (sHit !== null && sHit !== 'close' && sHit !== 'rotate' && eff !== 'ink')
      if (cHit) {
        const c = useUI.getState().compass!
        const w = screenToWorld(editor.camera, p.x, p.y)
        if (cHit === 'close') {
          useUI.setState({ compass: null })
          try {
            overlay.releasePointerCapture(e.pointerId)
          } catch {
            // not captured
          }
        } else if (cHit === 'radius') {
          gesture = { kind: 'compRadius', pointerId: e.pointerId }
        } else if (cHit === 'pencil') {
          // The pencil turns around the needle and draws with the current pen.
          editor.clearSelection()
          const ui = useUI.getState()
          const isHl = ui.tool === 'highlighter'
          const slot = inkSlot()
          const start: Point = [c.x + Math.cos(c.a) * c.r, c.y + Math.sin(c.a) * c.r, 0.5]
          gesture = {
            kind: 'ink',
            pointerId: e.pointerId,
            start,
            live: {
              tool: isHl ? 'highlighter' : 'pen',
              color: slot.color,
              size: slot.size,
              pressure: false,
              geom: 'line',
              points: [],
              ...(slot.dash ? { dash: slot.dash } : {}),
              ...(slot.startCap ? { startCap: slot.startCap } : {}),
              ...(slot.endCap ? { endCap: slot.endCap } : {})
            },
            snap: { mode: 'compass', a0: c.a, last: Math.atan2(w.y - c.y, w.x - c.x), sweep: 0 }
          }
        } else {
          gesture = { kind: 'compMove', pointerId: e.pointerId, ox: c.x - w.x, oy: c.y - w.y }
        }
      } else if (endGrab) {
        editor.setSelection([endGrab.item])
        gesture = { kind: 'endpoint', pointerId: e.pointerId, original: endGrab.item, current: endGrab.item, which: endGrab.which }
        hoverBox = null
      } else if (pHit === 'close') {
        useUI.setState({ protractor: null })
        try {
          overlay.releasePointerCapture(e.pointerId)
        } catch {
          // not captured
        }
      } else if (pHit === 'settings') {
        togglePanel()
        try {
          overlay.releasePointerCapture(e.pointerId)
        } catch {
          // not captured
        }
      } else if (pHit === 'rotate') {
        gesture = { kind: 'protRotate', pointerId: e.pointerId }
      } else if (protGrab) {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const prot = useUI.getState().protractor!
        gesture = { kind: 'protMove', pointerId: e.pointerId, ox: prot.x - w.x, oy: prot.y - w.y }
      } else if (sSlot && sHit === 'close') {
        useUI.setState({ [sSlot]: null })
        try {
          overlay.releasePointerCapture(e.pointerId)
        } catch {
          // not captured
        }
      } else if (sSlot && sHit === 'rotate') {
        gesture = { kind: 'straightRotate', slot: sSlot, pointerId: e.pointerId }
      } else if (sSlot && straightGrab) {
        const w = screenToWorld(editor.camera, p.x, p.y)
        const s = useUI.getState()[sSlot]!
        gesture = { kind: 'straightMove', slot: sSlot, pointerId: e.pointerId, ox: s.x - w.x, oy: s.y - w.y }
      } else if (eff === 'pan') {
        gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
      } else if (eff === 'text') {
        // Click on text = edit it; anywhere else = start typing there.
        const w = screenToWorld(editor.camera, p.x, p.y)
        const hit = hitTest(scene.getItems(), w.x, w.y, 4 / editor.camera.zoom)
        if (hit?.type === 'text' && !hit.locked) editor.editText(hit)
        else {
          const size = useUI.getState().textStyle.size
          editor.startText(w.x, w.y - (size * 1.25) / 2)
        }
        try {
          overlay.releasePointerCapture(e.pointerId)
        } catch {
          // not captured
        }
      } else if (eff === 'select' || eff === 'move') {
        const w = screenToWorld(editor.camera, p.x, p.y)
        // Double click / double tap (pen too) on text edits it.
        const tapHit = e.button === 0 ? hitTest(scene.getItems(), w.x, w.y, 4 / editor.camera.zoom) : null
        const now = performance.now()
        const editable = tapHit?.type === 'text' || tapHit?.type === 'formula'
        if (tapHit && editable && !isLocked(tapHit) && lastTap?.id === tapHit.id && now - lastTap.t < 500) {
          lastTap = null
          try {
            overlay.releasePointerCapture(e.pointerId)
          } catch {
            // not captured
          }
          editor.commitPreview()
          if (tapHit.type === 'text') editor.editText(tapHit)
          else if (tapHit.type === 'formula') editor.editFormula(tapHit)
          return
        }
        lastTap = tapHit && editable ? { id: tapHit.id, t: now } : null
        const h = selH
        const locked = editor.selectionLocked()
        if (h?.kind === 'handle') {
          // Scale uniformly about the opposite corner.
          const b = h.box
          const xs = [b.minX, b.maxX, b.maxX, b.minX]
          const ys = [b.minY, b.minY, b.maxY, b.maxY]
          const o = (h.corner + 2) % 4
          gesture = { kind: 'scale', pointerId: e.pointerId, ax: xs[o], ay: ys[o], cx: xs[h.corner], cy: ys[h.corner] }
        } else if (h?.kind === 'side') {
          // Stretch a shape in one direction; it's re-generated, so line widths stay the same.
          const sel = selInfo()?.shape
          if (sel) {
            const gid = sel.parts[0].groupId
            const inUserGroup = !!gid && scene.getItems().some((i) => i.groupId === gid && !sel.parts.includes(i as StrokeItem))
            gesture = {
              kind: 'reshape',
              pointerId: e.pointerId,
              side: h.side,
              spec: sel.spec,
              parts: sel.parts,
              current: sel.parts,
              inUserGroup,
              startX: w.x,
              startY: w.y
            }
          }
        } else if (h?.kind === 'body' && !locked) {
          gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
        } else if (eff === 'move') {
          // Quick move: grab whatever is under the pointer and drag it; empty space drags the board.
          const target = h ? null : hoverTarget(p.x, p.y)
          if (target) {
            editor.setSelection([target.item])
            if (!isLocked(target.item)) gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
          } else if (!h) {
            editor.clearSelection()
            gesture = { kind: 'pan', pointerId: e.pointerId, lastX: p.x, lastY: p.y }
          }
        } else {
          // Pressing on a highlighted item grabs it right away; empty space (or a locked item) starts a lasso.
          const hit = hitTest(scene.getItems(), w.x, w.y, 6 / editor.camera.zoom)
          if (hit && !isLocked(hit) && (e.pointerType !== 'pen' || hoverBox)) {
            editor.setSelection([hit])
            gesture = { kind: 'move', pointerId: e.pointerId, startX: w.x, startY: w.y }
          } else {
            gesture = { kind: 'lasso', pointerId: e.pointerId, points: [[w.x, w.y]], startX: p.x, startY: p.y, moved: false }
          }
        }
        hoverBox = null
      } else if (eff === 'shape') {
        editor.clearSelection()
        const ui = useUI.getState()
        const w = screenToWorld(editor.camera, p.x, p.y)
        const slot = ui.pens[ui.activePen]
        const base = SHAPE_BASES[ui.shape] ? (ui.shapeBases[ui.shape] ?? SHAPE_BASES[ui.shape]!.def) : undefined
        gesture = {
          kind: 'shape',
          pointerId: e.pointerId,
          shape: ui.shape,
          base,
          ax: w.x,
          ay: w.y,
          bx: w.x,
          by: w.y,
          keep: false,
          sx: p.x,
          sy: p.y,
          moved: false,
          live: {
            tool: 'pen',
            color: slot.color,
            size: slot.size,
            pressure: false,
            geom: 'line',
            points: [],
            ...(slot.dash ? { dash: slot.dash } : {}),
            // Line ends apply to the Line shape only.
            ...(ui.shape === 'line' && slot.startCap ? { startCap: slot.startCap } : {}),
            ...(ui.shape === 'line' && slot.endCap ? { endCap: slot.endCap } : {})
          }
        }
      } else if (eff === 'brush') {
        const h = selectionHit(p.x, p.y)
        if (h?.kind === 'handle' && !editor.selectionLocked()) {
          const b = h.box
          const xs = [b.minX, b.maxX, b.maxX, b.minX]
          const ys = [b.minY, b.minY, b.maxY, b.maxY]
          const o = (h.corner + 2) % 4
          gesture = { kind: 'scale', pointerId: e.pointerId, ax: xs[o], ay: ys[o], cx: xs[h.corner], cy: ys[h.corner] }
        } else {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const g: Gesture = {
            kind: 'brush',
            pointerId: e.pointerId,
            lastX: w.x,
            lastY: w.y,
            remove: e.ctrlKey || e.metaKey || e.altKey,
            touched: false,
            moved: false,
            sx: p.x,
            sy: p.y
          }
          gesture = g
          brushSegment(w.x, w.y, w.x, w.y, g)
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
          live: {
            tool: isHl ? 'highlighter' : 'pen',
            color: slot.color,
            size: slot.size,
            // Dashed / dotted ink is drawn along its centre line, so it has no pressure width.
            pressure: pressure && !slot.dash,
            points: [start],
            ...(slot.dash ? { dash: slot.dash } : {}),
            ...(slot.startCap ? { startCap: slot.startCap } : {}),
            ...(slot.endCap ? { endCap: slot.endCap } : {})
          }
        }
        // Shift held from the start: straight line.
        if (e.shiftKey) gesture.live = { ...gesture.live, geom: 'line', pressure: false }
        // Drawing along the protractor: arc along the edge, ray from the centre, or along the baseline.
        const prot = useUI.getState().protractor
        if (prot && (pHit === 'arc' || pHit === 'center' || pHit === 'base')) {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const g = gesture
          g.live = { ...g.live, geom: 'line', pressure: false }
          const ins = useUI.getState().instruments
          if (pHit === 'arc') {
            g.snap = { mode: 'arc', startDeg: snapDeg(scaleAngle(prot, w.x, w.y), ins.protStep) }
          }
          else if (pHit === 'center') g.snap = { mode: 'center' }
          else g.snap = { mode: 'base', u0: Math.max(-prot.r, Math.min(prot.r, toLocal(prot, w.x, w.y).u)) }
          g.live.points = []
        } else if (sSlot && edgeOf(sHit) !== null) {
          const s = useUI.getState()[sSlot]
          const edge = edgeOf(sHit)!
          if (s) {
            const w = screenToWorld(editor.camera, p.x, p.y)
            const g = gesture
            g.live = { ...g.live, geom: 'line', pressure: false, points: [] }
            g.snap = { mode: 'straight', slot: sSlot, edge, d0: edgePos(s, edge, w.x, w.y) }
          }
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

      // No button held any more, but the gesture is still running: the release happened somewhere we
      // didn't hear about (over a panel, outside the window). End it, or the pen would keep dragging.
      if (gesture && 'pointerId' in gesture && gesture.pointerId === e.pointerId && e.buttons === 0) finishGesture()
      const g = gesture
      if (g && 'pointerId' in g && g.pointerId === e.pointerId) {
        if (g.kind === 'pan') {
          editor.setCamera(panBy(editor.camera, p.x - g.lastX, p.y - g.lastY))
          g.lastX = p.x
          g.lastY = p.y
        } else if (g.kind === 'compMove') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const c = useUI.getState().compass
          if (c) {
            const rx = w.x + g.ox
            const ry = w.y + g.oy
            const pt = e.ctrlKey || e.metaKey ? snapPt(rx, ry) : { x: rx, y: ry }
            useUI.setState({ compass: { ...c, ...pt } })
          }
        } else if (g.kind === 'compRadius') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const c = useUI.getState().compass
          if (c) {
            const next = radiusFromHandle(c, w.x, w.y, editor.camera.zoom)
            useUI.setState({ compass: next })
            angleLabel = { sx: p.x, sy: p.y, text: radiusLabel(useUI.getState().lang, next.r) }
          }
        } else if (g.kind === 'protMove') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const prot = useUI.getState().protractor
          if (prot) {
            const rx = w.x + g.ox
            const ry = w.y + g.oy
            const pt = e.ctrlKey || e.metaKey ? snapPt(rx, ry) : { x: rx, y: ry }
            useUI.setState({ protractor: { ...prot, ...pt } })
          }
        } else if (g.kind === 'protRotate') {
          const prot = useUI.getState().protractor
          if (prot) {
            const w = screenToWorld(editor.camera, p.x, p.y)
            let rot = Math.atan2(w.y - prot.y, w.x - prot.x)
            const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2
            const snapped = Math.round(rot / step) * step
            // Shift: 15° steps; otherwise a gentle magnet to horizontal / vertical.
            if (e.shiftKey || Math.abs(rot - snapped) < (3 * Math.PI) / 180) rot = snapped
            const r = Math.max(60 / editor.camera.zoom, Math.hypot(w.x - prot.x, w.y - prot.y) - 26 / editor.camera.zoom)
            useUI.setState({ protractor: { ...prot, rot, r } })
          }
        } else if (g.kind === 'straightMove') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const s = useUI.getState()[g.slot]
          if (s) {
            const raw = { ...s, x: w.x + g.ox, y: w.y + g.oy }
            const [sx, sy] = gridSteps()
            const next = e.ctrlKey || e.metaKey ? snapStraightedgeToGrid(raw, sx, sy) : raw
            useUI.setState({ [g.slot]: next })
          }
        } else if (g.kind === 'straightRotate') {
          const s = useUI.getState()[g.slot]
          if (s) {
            const w = screenToWorld(editor.camera, p.x, p.y)
            const next = rotateFromHandle(s, w.x, w.y, editor.camera.zoom, e.shiftKey)
            useUI.setState({ [g.slot]: next })
            let deg = Math.round((-next.rot * 180) / Math.PI) % 360
            if (deg < 0) deg += 360
            const lang = useUI.getState().lang
            angleLabel = { sx: p.x, sy: p.y, text: `${deg}° · ${cmText(next.size, translate(lang, 'instruments.cm'), lang === 'uk')}` }
          }
        } else if (g.kind === 'lasso') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          g.points.push([w.x, w.y])
          if (Math.hypot(p.x - g.startX, p.y - g.startY) > 4) g.moved = true
        } else if (g.kind === 'move') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          editor.setPreview({ s: 1, ax: 0, ay: 0, dx: w.x - g.startX, dy: w.y - g.startY })
        } else if (g.kind === 'endpoint') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const ends = lineEnds(g.original)!
          let fixed: End = ends[1 - g.which]
          let end: End = [w.x, w.y]
          const prot = useUI.getState().protractor
          const near = 20 / editor.camera.zoom
          let deg: number
          if (prot && Math.hypot(fixed[0] - prot.x, fixed[1] - prot.y) <= near) {
            // The line starts at the protractor's centre: turn it in whole degrees of its scale.
            fixed = [prot.x, prot.y]
            const { u, v } = toLocal(prot, w.x, w.y)
            deg = Math.round((Math.atan2(-v, u) * 180) / Math.PI)
            if (deg < 0) deg += 360
            const len = Math.hypot(u, v)
            const a = (deg * Math.PI) / 180
            const pt = toWorld(prot, Math.cos(a) * len, -Math.sin(a) * len)
            end = [pt.x, pt.y]
          } else {
            if (prot && Math.hypot(w.x - prot.x, w.y - prot.y) <= near) end = [prot.x, prot.y]
            else if (e.shiftKey) {
              // Shift: 15° steps.
              const len = Math.hypot(w.x - fixed[0], w.y - fixed[1])
              const step = Math.PI / 12
              const a = Math.round(Math.atan2(w.y - fixed[1], w.x - fixed[0]) / step) * step
              end = [fixed[0] + Math.cos(a) * len, fixed[1] + Math.sin(a) * len]
            }
            deg = Math.round((Math.atan2(-(end[1] - fixed[1]), end[0] - fixed[0]) * 180) / Math.PI)
            if (deg < 0) deg += 360
          }
          angleLabel = { sx: p.x, sy: p.y, text: `${deg % 360}°` }
          const next = g.which === 0 ? withEnds(g.original, end, fixed) : withEnds(g.original, fixed, end)
          scene.replace([g.current], [next], false)
          g.current = next
        } else if (g.kind === 'reshape') {
          const w = screenToWorld(editor.camera, p.x, p.y)
          const dx = w.x - g.startX
          const dy = w.y - g.startY
          const sp = g.spec
          let x0 = Math.min(sp.ax, sp.bx)
          let x1 = Math.max(sp.ax, sp.bx)
          let y0 = Math.min(sp.ay, sp.by)
          let y1 = Math.max(sp.ay, sp.by)
          const m = 8 / editor.camera.zoom
          if (g.side === 0) y0 = Math.min(y0 + dy, y1 - m)
          else if (g.side === 1) x1 = Math.max(x1 + dx, x0 + m)
          else if (g.side === 2) y1 = Math.max(y1 + dy, y0 + m)
          else x0 = Math.min(x0 + dx, x1 - m)
          const next = regenerateShape(g.parts, { ...sp, ax: x0, ay: y0, bx: x1, by: y1 }, () => scene.allocZ(), g.inUserGroup)
          scene.replace(g.current, next, false)
          g.current = next
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
          const prot = useUI.getState().protractor
          const comp = useUI.getState().compass
          if (g.kind === 'ink' && g.snap?.mode === 'compass') {
            if (comp) {
              // Follow the pointer around the needle; the sweep adds up (up to one full turn either way).
              const w = screenToWorld(editor.camera, p.x, p.y)
              const ang = Math.atan2(w.y - comp.y, w.x - comp.x)
              let d = ang - g.snap.last
              if (d > Math.PI) d -= Math.PI * 2
              if (d < -Math.PI) d += Math.PI * 2
              g.snap.last = ang
              g.snap.sweep = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, g.snap.sweep + d))
              // The raw sweep keeps adding up the turns; what is drawn snaps to quarter turns.
              const sweep = snapSweep(g.snap.sweep, comp.r, editor.camera.zoom)
              useUI.setState({ compass: { ...comp, a: g.snap.a0 + sweep } })
              g.live = { ...g.live, points: compassArc(comp, g.snap.a0, sweep) }
              angleLabel = { sx: p.x, sy: p.y, text: `${Math.round(Math.abs((sweep * 180) / Math.PI))}°` }
            }
          } else if (g.kind === 'ink' && g.snap?.mode === 'straight') {
            const s = useUI.getState()[g.snap.slot]
            if (s) {
              const w = screenToWorld(editor.camera, p.x, p.y)
              const off = g.live.size / 2 + 1 / editor.camera.zoom
              const d1 = edgePos(s, g.snap.edge, w.x, w.y)
              g.live = { ...g.live, points: edgeStroke(s, g.snap.edge, g.snap.d0, d1, off) }
              const lang = useUI.getState().lang
              angleLabel = { sx: p.x, sy: p.y, text: cmText(Math.abs(d1 - g.snap.d0), translate(lang, 'instruments.cm'), lang === 'uk') }
            }
          } else if (g.kind === 'ink' && g.snap && g.snap.mode !== 'compass' && g.snap.mode !== 'straight' && prot) {
            const w = screenToWorld(editor.camera, p.x, p.y)
            const off = g.live.size / 2 + 1 / editor.camera.zoom
            const ins = useUI.getState().instruments
            if (g.snap.mode === 'arc') {
              const cur = snapDeg(scaleAngle(prot, w.x, w.y), ins.protStep)
              g.snap.endDeg = cur
              g.live = { ...g.live, points: arcStroke(prot, g.snap.startDeg, cur, off) }
              angleLabel = { sx: p.x, sy: p.y, text: degText(Math.abs(cur - g.snap.startDeg), useUI.getState().lang === 'uk') }
            } else if (g.snap.mode === 'center') {
              const deg = snapDeg(scaleAngle(prot, w.x, w.y), ins.protStep)
              const len = Math.max(Math.hypot(w.x - prot.x, w.y - prot.y), 2 / editor.camera.zoom)
              g.live = { ...g.live, points: rayStroke(prot, deg, len) }
              angleLabel = { sx: p.x, sy: p.y, text: degText(deg, useUI.getState().lang === 'uk') }
            } else {
              const u = Math.max(-prot.r, Math.min(prot.r, toLocal(prot, w.x, w.y).u))
              g.live = { ...g.live, points: baseStroke(prot, g.snap.u0, u, off) }
            }
          } else if (g.kind === 'ink') {
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
            g.bx = w.x
            g.by = w.y
            g.keep = e.shiftKey
            if (g.moved) g.live = { ...g.live, parts: shapeParts(g.shape, g.ax, g.ay, w.x, w.y, e.shiftKey, g.live.size, g.base) }
          } else if (g.kind === 'brush') {
            if (Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true
            for (const ev of events) {
              const lp = local(ev)
              const w = screenToWorld(editor.camera, lp.x, lp.y)
              brushSegment(g.lastX, g.lastY, w.x, w.y, g)
              g.lastX = w.x
              g.lastY = w.y
            }
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
        const picking = (tool === 'select' || tool === 'move') && !spaceDown
        hoverBox = picking && !selectionHit(p.x, p.y) ? (hoverTarget(p.x, p.y)?.box ?? null) : null
        // Show the end points of a straight line under the pointer (kept while the pointer is on one of them).
        const prevLine = hoverLine
        hoverLine = !picking ? null : hoverLine && nearEnd(hoverLine, p.x, p.y) !== null ? hoverLine : lineAt(p.x, p.y)
        if (prevLine !== hoverLine) invalidate(false)
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
        hoverLine = null
        invalidate(false)
      }
    }

    const onWheel = (e: WheelEvent): void => {
      if (!fileActions && !document.hasFocus()) return
      e.preventDefault()
      const p = local(e)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      if (useUI.getState().tool === 'brushSelect' && !e.ctrlKey && !e.metaKey && !spaceDown) {
        // Brush select: the wheel sizes the circle (like Blender's circle select).
        const r = useUI.getState().selectRadius * Math.exp(-dy * 0.002)
        useUI.setState({ selectRadius: Math.max(6, Math.min(240, r)) })
        invalidate(false)
        return
      }
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
    // Only real text fields swallow shortcuts; a focused slider or checkbox must not block Ctrl+Z, 1, 2, 3…
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      (t.isContentEditable ||
        t.tagName === 'TEXTAREA' ||
        (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'color'].includes(t.type)))

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      const ui = useUI.getState()
      // Hold Space = pan (not a one-shot shortcut).
      if (e.code === 'Space' && ui.view === 'board' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (!spaceDown) {
          spaceDown = true
          updateCssCursor()
          invalidate(false)
        }
        return
      }
      // All shortcuts come from shortcuts.ts and match the physical key, so they work on any layout.
      const sc = matchShortcut(e, ui.view === 'board' ? 'board' : 'app')
      if (!sc) return
      if (isBoardFileShortcut(sc.id)) {
        if (!fileActions) return
        e.preventDefault()
        void fileActions[sc.id]()
        return
      }
      e.preventDefault()
      const actions: Record<Exclude<ShortcutId, BoardFileShortcut>, () => unknown> = {
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        zoomIn: () => editor.zoomStep(1),
        zoomOut: () => editor.zoomStep(-1),
        zoomReset: () => editor.resetZoom(),
        selectAll: () => editor.selectAll(),
        duplicate: () => editor.duplicateSelection(),
        group: () => editor.groupSelection(),
        ungroup: () => editor.ungroupSelection(),
        delete: () => editor.deleteSelection(),
        escape: () => editor.clearSelection(),
        pen1: () => ui.selectPen(0),
        pen2: () => ui.selectPen(1),
        pen3: () => ui.selectPen(2),
        pen: () => ui.selectPen(ui.activePen),
        highlighter: () => ui.setTool('highlighter'),
        eraser: () => ui.setTool('eraser'),
        // Quick swap between the current pen and the eraser (handy on a tablet ExpressKey).
        swapEraser: () => (ui.tool === 'eraser' ? ui.selectPen(ui.activePen) : ui.setTool('eraser')),
        lasso: () => ui.setTool('select'),
        brushSelect: () => ui.setTool('brushSelect'),
        move: () => ui.setTool('move'),
        ruler: () => { if (!e.repeat) editor.toggleRuler() },
        square45: () => { if (!e.repeat) editor.toggleSetSquare('square45') },
        square60: () => { if (!e.repeat) editor.toggleSetSquare('square60') },
        protractor: () => editor.toggleProtractor(),
        compass: () => editor.toggleCompass()
      }
      void actions[sc.id]()
    }

    // A Space released while another window had focus never sends keyup: don't stay stuck in pan mode.
    const onBlur = (): void => {
      if (gesture && gesture.kind !== 'pinch') finishGesture()
      if (!spaceDown) return
      spaceDown = false
      updateCssCursor()
      invalidate(false)
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
      if (
        s.protractor !== prev.protractor ||
        s.compass !== prev.compass ||
        s.ruler !== prev.ruler ||
        s.setSquare !== prev.setSquare ||
        s.instruments !== prev.instruments
      )
        invalidate(false)
      if (s.textEdit?.id !== prev.textEdit?.id || s.formulaEdit?.id !== prev.formulaEdit?.id) invalidate(true)
      if (s.tool !== prev.tool) {
        hoverBox = null
        hoverLine = null
      }
      // Items changed under the pointer (delete, undo…): drop a stale highlight.
      if (s.sceneVersion !== prev.sceneVersion && !gesture) {
        hoverBox = null
        hoverLine = null
      }
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
    window.addEventListener('blur', onBlur)
    // Releases outside the board (pointer capture lost, pen lifted over a panel) still end the gesture.
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    overlay.addEventListener('lostpointercapture', onPointerUp)
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
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      overlay.removeEventListener('lostpointercapture', onPointerUp)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [fileActions])

  return (
    <div className="board">
      <canvas ref={baseRef} className="board-canvas" />
      <canvas ref={overlayRef} className="board-canvas board-overlay" />
    </div>
  )
}
