import type { BoardEntry, TemplateEntry } from '../../shared/library'
import { clampZoom, screenToWorld, zoomAt } from './engine/camera'
import { renderPng, renderSvg, renderThumbnail } from './engine/export'
import { BUILTIN_GRAPHS, FN_COLORS, fitRanges, graphBBox, MAX_FNS, sanitizeGraph } from './engine/graph'
import { plotFormula, plotHead, rowsToText } from './engine/formulaexpr'
import { bboxOfPoints, newId } from './engine/geometry'
import { loadImage, readFileAsDataURL } from './engine/images'
import { Scene } from './engine/scene'
import {
  decodeBoard,
  deserializeBoard,
  encodeBoard,
  serializeBoard,
  type BoardData,
  type BoardFile
} from './engine/serialize'
import { editableShape, regenerateShape } from './engine/shapeItems'
import { applyXform, unionBBox, type Xform } from './engine/transform'
import { COMPASS_CELL } from './engine/compass'
import { CM } from './engine/straightedge'
import { formatAll, formatRange, fullRuns, textBBox, textFields, trimRunsEnd } from './engine/text'
import { isBlank } from './engine/formula'
import { formulaBBox, formulaBox } from './engine/formulatype'
import type { BBox, Camera, FormulaItem, GraphItem, GraphParams, PlotFn, ImageItem, Item, LineCap, LineDash, ShapeSpec, StrokeItem, TextFormat, TextItem } from './engine/types'
import { translate, type MessageKey } from './i18n'
import { platform } from './platform'
import { FORMULA_HISTORY, useUI } from './store'

const CLIPBOARD_MIME = 'application/x-inkboard'

/** Line ends fit any open line: freehand ink, straight lines, the Line shape (not closed shapes or arrows). */
export const canHaveEnds = (s: StrokeItem): boolean => !s.shape || s.shape.kind === 'line'
/**
 * Autosave: write at most 5 s after the first unsaved change, even while drawing non-stop, so a crash
 * or power cut loses at most 5 s of work. Leaving the board, closing the app, sleep and Ctrl+S save
 * right away.
 */
/** Height the math keypad needs at the bottom of the window (px), with a little air above it. */
const KEYPAD_ROOM = 330

const SAVE_DELAY_MS = 5000
/** Thumbnails are re-rendered at most this often while editing (always on leaving a board). */
const THUMB_INTERVAL_MS = 10_000
const DEFAULT_CAMERA: Camera = { x: -80, y: -80, zoom: 1 }

/**
 * Glue between the imperative board engine and the React UI.
 * UI components call these methods; the Board component registers the render callback.
 */
class Editor {
  readonly scene = new Scene()
  camera: Camera = { ...DEFAULT_CAMERA }
  viewport = { width: 0, height: 0 }
  /** Live move/scale of the selection, drawn without touching the scene until committed. */
  preview: { ids: ReadonlySet<string>; t: Xform } | null = null

  private invalidate: (base?: boolean) => void = () => {}
  /** False while a board is being loaded, so loading doesn't count as an edit. */
  private ready = false
  // Change tracking for autosave.
  private metaVersion = 0
  private saved = { version: -1, meta: -1, camera: DEFAULT_CAMERA }
  private thumbVersion = -1
  private lastThumbAt = 0
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> | null = null

  constructor() {
    this.scene.subscribe(() => {
      // Drop selected ids that no longer exist (e.g. after undo).
      const sel = useUI.getState().selectedIds
      const alive = sel.length ? this.scene.getById(sel).map((i) => i.id) : sel
      useUI.setState({
        canUndo: this.scene.canUndo,
        canRedo: this.scene.canRedo,
        sceneVersion: this.scene.version,
        selectedIds: alive.length === sel.length ? sel : alive
      })
      this.markChanged()
      this.invalidate(true)
    })
    useUI.subscribe((s, prev) => {
      if (s.background !== prev.background) {
        this.metaVersion++
        this.markChanged()
        this.invalidate(true)
      } else if (s.selectedIds !== prev.selectedIds || s.tool !== prev.tool) {
        this.invalidate(false)
      }
      if (s.lang !== prev.lang || s.board !== prev.board || s.view !== prev.view) this.updateTitle()
      // The function panel belongs to one selected plane: close it when that plane stops being the selection.
      if (s.fnPanel && (s.selectedIds.length !== 1 || s.selectedIds[0] !== s.fnPanel.id || s.view !== 'board')) {
        useUI.setState({ fnPanel: null })
      }
      if (s.tool !== prev.tool) {
        // Picking a drawing tool means "done with the selection": drop it (lasso ↔ move keep it).
        if (s.tool !== 'select' && s.tool !== 'brushSelect' && s.tool !== 'move' && s.selectedIds.length) useUI.setState({ selectedIds: [] })
        if (s.tool !== 'text' && s.textEdit) this.commitText()
        // (Starting a formula switches the tool itself: that one is not a reason to finish it.)
        if (s.formulaEdit && s.formulaEdit === prev.formulaEdit) this.commitFormula(false)
      }
    })
  }

  attach(invalidate: (base?: boolean) => void): () => void {
    this.invalidate = invalidate
    return () => {
      this.invalidate = () => {}
    }
  }

  requestRender(base = true): void {
    this.invalidate(base)
  }

  t(key: MessageKey): string {
    return translate(useUI.getState().lang, key)
  }

  // ---------------------------------------------------------------- camera

  /** Visible board size; falls back to the window if the board hasn't been measured yet. */
  view(): { width: number; height: number } {
    const { width, height } = this.viewport
    return width > 0 && height > 0 ? this.viewport : { width: window.innerWidth, height: window.innerHeight }
  }

  setCamera(cam: Camera): void {
    this.camera = cam
    useUI.setState({ camera: cam, zoom: cam.zoom })
    this.invalidate(true)
  }

  /** Show every item: centre the board's content and zoom out if needed (never above 100%). */
  fitToContent(): void {
    const box = unionBBox([...this.scene.getItems()])
    if (!box) return
    const { width, height } = this.view()
    // Leave room for the toolbar at the top and a margin around the content.
    const top = 110
    const margin = 60
    const availW = Math.max(1, width - margin * 2)
    const availH = Math.max(1, height - top - margin)
    const bw = Math.max(1, box.maxX - box.minX)
    const bh = Math.max(1, box.maxY - box.minY)
    const zoom = clampZoom(Math.min(1, availW / bw, availH / bh))
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    this.setCamera({ x: cx - width / 2 / zoom, y: cy - (top + availH / 2) / zoom, zoom })
  }

  zoomBy(factor: number): void {
    const { width, height } = this.view()
    this.setCamera(zoomAt(this.camera, width / 2, height / 2, this.camera.zoom * factor))
  }

  /** Step through "nice" zoom levels, like the +/- buttons in Whiteboard. */
  zoomStep(dir: 1 | -1): void {
    const levels = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 20]
    const z = this.camera.zoom
    const next =
      dir > 0 ? levels.find((l) => l > z + 1e-3) : [...levels].reverse().find((l) => l < z - 1e-3)
    this.zoomBy(clampZoom(next ?? z) / z)
  }

  resetZoom(): void {
    this.zoomBy(1 / this.camera.zoom)
  }

  // ---------------------------------------------------------------- history

  undo(): void {
    this.scene.undo()
  }

  redo(): void {
    this.scene.redo()
  }

  // ---------------------------------------------------------------- selection

  selectedItems(): Item[] {
    const ids = useUI.getState().selectedIds
    return ids.length ? this.scene.getById(ids) : []
  }

  /** Select items; picking any member of a group selects the whole group. */
  setSelection(items: Item[]): void {
    const groups = new Set(items.map((i) => i.groupId).filter(Boolean))
    const all = groups.size ? this.scene.getItems().filter((i) => (i.groupId && groups.has(i.groupId)) || items.includes(i)) : items
    useUI.setState({ selectedIds: all.map((i) => i.id) })
  }

  /** Change colour / width / pattern / ends of the selected lines (undoable). Ends don't go on closed shapes. */
  restyleSelection(patch: { color?: string; size?: number; dash?: LineDash; startCap?: LineCap; endCap?: LineCap }): void {
    const strokes = this.selectedItems().filter((i): i is StrokeItem => i.type === 'stroke' && !i.locked)
    if (!strokes.length) return
    const next = strokes.map((s) => {
      const n: StrokeItem = { ...s }
      if ('color' in patch && patch.color) n.color = patch.color
      if ('size' in patch && patch.size) {
        n.size = patch.size
        n.bbox = bboxOfPoints(n.points, n.geom ? n.size * 3 : n.size)
      }
      if ('dash' in patch) {
        if (patch.dash) n.dash = patch.dash
        else delete n.dash
      }
      for (const k of ['startCap', 'endCap'] as const) {
        if (!(k in patch) || !canHaveEnds(n)) continue
        if (patch[k]) n[k] = patch[k]
        else delete n[k]
      }
      return n
    })
    this.scene.replace(strokes, next)
  }

  // ---------------------------------------------------------------- text

  /** Start typing new text with its top-left corner at a board point. */
  startText(x: number, y: number): void {
    this.commitText()
    const { color, size } = useUI.getState().textStyle
    useUI.setState({ textEdit: { x, y, size, color, runs: [] }, selectedIds: [] })
  }

  /** Edit an existing text item in place (it's hidden on the board meanwhile). */
  editText(item: TextItem): void {
    if (item.locked) return
    this.commitText()
    useUI.setState({ textEdit: { id: item.id, x: item.x, y: item.y, size: item.size, color: item.color, runs: fullRuns(item) }, selectedIds: [] })
    this.invalidate(true)
  }

  /** Finish typing: add / update the text item (empty text removes it). Undoable. */
  commitText(): void {
    const te = useUI.getState().textEdit
    if (!te) return
    useUI.setState({ textEdit: null })
    const fields = textFields(trimRunsEnd(te.runs), te)
    const old = te.id ? (this.scene.getById([te.id])[0] as TextItem | undefined) : undefined
    if (!fields.text) {
      if (old) this.scene.remove([old])
      else this.invalidate(true)
      return
    }
    if (old && old.text === fields.text && old.color === fields.color && old.size === fields.size && JSON.stringify(old.runs) === JSON.stringify(fields.runs)) {
      return this.invalidate(true)
    }
    const item: TextItem = {
      type: 'text',
      id: old?.id ?? newId(),
      z: old?.z ?? this.scene.allocZ(),
      x: te.x,
      y: te.y,
      ...fields,
      ...(old?.groupId ? { groupId: old.groupId } : {}),
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
    item.bbox = textBBox(item)
    if (old) this.scene.replace([old], [item])
    else this.scene.add([item])
  }

  /** Format the whole text being typed (text tool options while editing). */
  formatEditingText(patch: TextFormat): void {
    const te = useUI.getState().textEdit
    if (!te) return
    const runs = formatRange(te.runs, 0, Infinity, patch)
    useUI.setState({ textEdit: { ...te, ...(patch.color ? { color: patch.color } : {}), ...(patch.size ? { size: patch.size } : {}), runs } })
  }

  /** Paste plain text as a text item in the middle of the view. */
  insertText(text: string): void {
    const clean = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').trim()
    if (!clean) return
    const { color, size } = useUI.getState().textStyle
    const item: TextItem = { type: 'text', id: newId(), z: this.scene.allocZ(), x: 0, y: 0, text: clean, size, color, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
    const b = textBBox(item)
    const c = screenToWorld(this.camera, this.view().width / 2, this.view().height / 2)
    item.x = c.x - (b.maxX - b.minX) / 2
    item.y = c.y - (b.maxY - b.minY) / 2
    item.bbox = textBBox(item)
    this.scene.add([item])
    useUI.setState({ tool: 'select' })
    this.setSelection([item])
  }

  /** Change colour / size / bold / italic / underline of the selected text items as a whole (undoable). */
  restyleText(patch: TextFormat): void {
    const texts = this.selectedItems().filter((i): i is TextItem => i.type === 'text' && !i.locked)
    if (!texts.length) return
    this.scene.replace(
      texts,
      texts.map((t) => {
        const { runs: _runs, ...rest } = t
        const n: TextItem = { ...rest, ...formatAll(t, patch) }
        return { ...n, bbox: textBBox(n) }
      })
    )
  }

  // ---------------------------------------------------------------- formulas

  /** Start a new formula in the upper middle of the view (the keypad takes the bottom). */
  startFormula(): void {
    this.commitText()
    this.commitFormula(false)
    const { color, size } = useUI.getState().formulaStyle
    const c = screenToWorld(this.camera, this.view().width / 2, this.view().height * 0.36)
    useUI.setState({
      tool: 'select',
      selectedIds: [],
      formulaEdit: { x: c.x - size * 2, baseline: c.y, size, color, rows: [], cur: { path: [], i: 0 } }
    })
  }

  /** Edit an existing formula in place (it's hidden on the board meanwhile). */
  editFormula(item: FormulaItem): void {
    if (item.locked) return
    this.commitText()
    this.commitFormula(false)
    useUI.setState({
      selectedIds: [],
      formulaEdit: { id: item.id, x: item.x, baseline: item.y + formulaBox(item).asc, size: item.size, color: item.color, rows: item.rows, cur: { path: [], i: item.rows.length } }
    })
    // The keypad takes the bottom of the window: bring a formula that sits there up into view.
    const cam = this.camera
    const bottom = (item.bbox.maxY - cam.y) * cam.zoom
    const limit = this.view().height - KEYPAD_ROOM
    if (bottom > limit) this.setCamera({ ...cam, y: cam.y + (bottom - limit) / cam.zoom })
    this.invalidate(true)
  }

  /** Finish a formula: add / update its item (an empty one is removed). Undoable. */
  commitFormula(select = true): void {
    const fe = useUI.getState().formulaEdit
    if (!fe) return
    useUI.setState({ formulaEdit: null, mathTarget: null })
    const old = fe.id ? (this.scene.getById([fe.id])[0] as FormulaItem | undefined) : undefined
    if (isBlank(fe.rows)) {
      if (old) this.scene.remove([old])
      else this.invalidate(true)
      return
    }
    if (old && old.rows === fe.rows && old.color === fe.color && old.size === fe.size) {
      if (select) this.setSelection([old])
      return this.invalidate(true)
    }
    const item: FormulaItem = {
      type: 'formula',
      id: old?.id ?? newId(),
      z: old?.z ?? this.scene.allocZ(),
      x: fe.x,
      y: fe.baseline - formulaBox(fe).asc,
      size: fe.size,
      color: fe.color,
      rows: fe.rows,
      ...(old?.groupId ? { groupId: old.groupId } : {}),
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
    item.bbox = formulaBBox(item)
    if (old) this.scene.replace([old], [item])
    else this.scene.add([item])
    const key = JSON.stringify(fe.rows)
    useUI.setState((s) => ({ formulaHistory: [fe.rows, ...s.formulaHistory.filter((r) => JSON.stringify(r) !== key)].slice(0, FORMULA_HISTORY) }))
    if (select) this.setSelection([item])
  }

  /** Change colour / size of the selected formulas (undoable); new formulas follow. */
  restyleFormula(patch: { color?: string; size?: number }): void {
    const list = this.selectedItems().filter((i): i is FormulaItem => i.type === 'formula' && !i.locked)
    if (!list.length) return
    useUI.setState((s) => ({ formulaStyle: { ...s.formulaStyle, ...patch } }))
    this.scene.replace(
      list,
      list.map((f) => {
        const n = { ...f, ...patch }
        return { ...n, bbox: formulaBBox(n) }
      })
    )
  }

  /** Ctrl+G: join the selection into one group (existing groups inside are merged). */
  groupSelection(): void {
    const items = this.selectedItems()
    if (items.length < 2) return
    const gid = newId()
    this.scene.replace(items, items.map((i) => ({ ...i, groupId: gid })))
  }

  /** Ctrl+Shift+G: split the selected groups back into separate items (they stay selected). */
  ungroupSelection(): void {
    const items = this.selectedItems().filter((i) => i.groupId)
    if (!items.length) return
    this.scene.replace(
      items,
      items.map(({ groupId: _g, ...rest }) => rest as Item)
    )
  }

  clearSelection(): void {
    if (useUI.getState().selectedIds.length) useUI.setState({ selectedIds: [] })
  }

  selectAll(): void {
    useUI.setState({ tool: 'select' })
    this.setSelection([...this.scene.getItems()])
  }

  /** Selection bounds in world units, including any live move/scale preview. */
  selectionBBox(): BBox | null {
    const box = unionBBox(this.selectedItems())
    if (!box || !this.preview) return box
    const t = this.preview.t
    const f = (x: number, a: number, d: number): number => a + (x - a) * t.s + d
    return {
      minX: f(box.minX, t.ax, t.dx),
      minY: f(box.minY, t.ay, t.dy),
      maxX: f(box.maxX, t.ax, t.dx),
      maxY: f(box.maxY, t.ay, t.dy)
    }
  }

  setPreview(t: Xform | null): void {
    this.preview = t ? { ids: new Set(useUI.getState().selectedIds), t } : null
    this.invalidate(true)
  }

  commitPreview(): void {
    const p = this.preview
    this.preview = null
    if (!p || (p.t.s === 1 && p.t.dx === 0 && p.t.dy === 0)) return this.invalidate(true)
    const old = this.scene.getById(p.ids)
    this.scene.replace(old, old.map((i) => applyXform(i, p.t)))
  }

  /** Delete the selection; locked items stay (and stay selected). */
  deleteSelection(): void {
    const all = this.selectedItems()
    const items = all.filter((i) => !i.locked)
    const kept = all.filter((i) => i.locked)
    useUI.setState({ selectedIds: kept.map((i) => i.id) })
    this.scene.remove(items)
  }

  /** True when anything in the selection is locked (it can't be moved, resized or restyled). */
  selectionLocked(): boolean {
    return this.selectedItems().some((i) => i.locked)
  }

  /** Lock the selection (or unlock it, if all of it is locked already). Undoable. */
  toggleLockSelection(): void {
    const items = this.selectedItems()
    if (!items.length) return
    const lock = !items.every((i) => i.locked)
    this.scene.replace(
      items,
      items.map((i) => {
        const n = { ...i }
        if (lock) n.locked = true
        else delete n.locked
        return n
      })
    )
  }

  /** Change the selected shape: another kind, another base, or another box (undoable). */
  updateShape(patch: Partial<ShapeSpec>): void {
    const sel = editableShape(this.selectedItems())
    if (!sel || sel.parts.some((p) => p.locked)) return
    const spec: ShapeSpec = { ...sel.spec, ...patch }
    if (!patch.base && spec.kind !== sel.spec.kind) delete spec.base
    const gid = sel.parts[0].groupId
    const inUserGroup = !!gid && this.scene.getItems().some((i) => i.groupId === gid && !sel.parts.includes(i as StrokeItem))
    const next = regenerateShape(sel.parts, spec, () => this.scene.allocZ(), inUserGroup)
    this.scene.replace(sel.parts, next)
    this.setSelection(next)
  }

  /** Copies of `items` with fresh ids, on top of everything, shifted by (dx, dy). */
  private cloneItems(items: Item[], dx: number, dy: number): Item[] {
    // Copies of a group form their own new group.
    const groupMap = new Map<string, string>()
    const regroup = (g?: string): string | undefined => {
      if (!g) return undefined
      if (!groupMap.has(g)) groupMap.set(g, newId())
      return groupMap.get(g)
    }
    return [...items]
      .sort((a, b) => a.z - b.z)
      .map((it) => {
        const copy = { ...applyXform(it, { s: 1, ax: 0, ay: 0, dx, dy }), id: newId(), z: this.scene.allocZ() }
        // Copies start unlocked.
        delete copy.locked
        const g = regroup(it.groupId)
        if (g) copy.groupId = g
        return copy
      })
  }

  duplicateSelection(): void {
    const items = this.selectedItems()
    if (!items.length) return
    const off = 24 / this.camera.zoom
    const copies = this.cloneItems(items, off, off)
    this.scene.add(copies)
    this.setSelection(copies)
  }

  // ---------------------------------------------------------------- clipboard

  /** Handles a DOM copy/cut event. Returns true if it put board items on the clipboard. */
  copyToClipboard(e: ClipboardEvent, cut: boolean): boolean {
    const items = this.selectedItems()
    if (!items.length || !e.clipboardData) return false
    const file = serializeBoard({ items, background: useUI.getState().background, camera: this.camera })
    e.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(file))
    // Only text selected: other apps get the words themselves.
    const onlyText = items.every((i) => i.type === 'text')
    e.clipboardData.setData(
      'text/plain',
      onlyText ? [...items].sort((a, b) => a.bbox.minY - b.bbox.minY).map((i) => (i as TextItem).text).join('\n') : JSON.stringify(file)
    )
    if (cut) this.deleteSelection()
    return true
  }

  /** Handles a DOM paste event: board items first, then images. Returns true if handled. */
  pasteFromClipboard(e: ClipboardEvent): boolean {
    const data = e.clipboardData
    if (!data) return false
    let json = data.getData(CLIPBOARD_MIME)
    if (!json) {
      const text = data.getData('text/plain')
      if (text.startsWith('{"format":"inkboard"')) json = text
    }
    if (json) {
      try {
        const { items } = deserializeBoard(JSON.parse(json) as BoardFile)
        this.placeAtCenter(items)
        return true
      } catch {
        // Not our data after all; fall through to images.
      }
    }
    const files = [...data.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      void this.insertImages(files)
      return true
    }
    const text = data.getData('text/plain')
    if (text.trim()) {
      this.insertText(text)
      return true
    }
    return false
  }

  /** Add copies of `items` centred in the viewport, selected (paste, templates). */
  private placeAtCenter(items: Item[]): void {
    const box = unionBBox(items)
    if (!box) return
    const c = screenToWorld(this.camera, this.view().width / 2, this.view().height / 2)
    // Keep the dot-paper alignment: shift by whole 24-unit cells.
    const snap = (v: number): number => Math.round(v / 24) * 24
    const copies = this.cloneItems(items, snap(c.x - (box.minX + box.maxX) / 2), snap(c.y - (box.minY + box.maxY) / 2))
    this.scene.add(copies)
    useUI.setState({ tool: 'select' })
    this.setSelection(copies)
  }

  // ---------------------------------------------------------------- coordinate graphs

  /** Insert a coordinate line/plane centred in the view, origin on a dot-paper point. */
  insertGraph(params: GraphParams): string {
    const p = sanitizeGraph(params)
    const c = screenToWorld(this.camera, this.view().width / 2, this.view().height / 2)
    // Centre the graph's box in the view.
    const b0 = graphBBox({ ...p, ox: 0, oy: 0 })
    const midX = (b0.minX + b0.maxX) / 2
    const midY = -(b0.minY + b0.maxY) / 2
    const snap = (v: number): number => Math.round(v / 24) * 24
    const g: GraphItem = {
      ...p,
      type: 'graph',
      id: newId(),
      z: this.scene.allocZ(),
      ox: snap(c.x - midX),
      oy: snap(c.y + midY),
      color: '#1e1e1e',
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
    g.bbox = graphBBox(g)
    this.scene.add([g])
    useUI.setState({ tool: 'select' })
    this.setSelection([g])
    return g.id
  }

  /** The functions the selected formulas stand for (formulas that are no function are left out). */
  selectedPlots(): PlotFn[] {
    const formulas = this.selectedItems()
      .filter((i): i is FormulaItem => i.type === 'formula')
      .sort((a, b) => a.bbox.minY - b.bbox.minY || a.bbox.minX - b.bbox.minX)
    const fns: PlotFn[] = []
    for (const f of formulas) {
      const p = plotFormula(f.rows)
      if (!p || fns.length === MAX_FNS) continue
      // The left side (y =, s(t) =) becomes the function's name and variable.
      const rows = f.rows.slice(plotHead(f.rows).len)
      fns.push({
        expr: rowsToText(rows, p.arg),
        color: FN_COLORS[fns.length % FN_COLORS.length],
        rows,
        ...(p.name && p.name !== 'y' ? { name: p.name } : {}),
        ...(p.arg !== 'x' ? { arg: p.arg } : {})
      })
    }
    return fns
  }

  /**
   * A coordinate plane next to the selection with the graphs of the selected formulas, its function
   * panel open (to set the range, the name, the variable). Undoable as one step.
   */
  plotSelected(): void {
    const fns = this.selectedPlots()
    const box = this.selectionBBox()
    if (!fns.length || !box) return
    const p = sanitizeGraph({ ...BUILTIN_GRAPHS[3].params, fns })
    const b0 = graphBBox({ ...p, ox: 0, oy: 0 })
    const snap = (v: number): number => Math.round(v / 24) * 24
    const g: GraphItem = {
      ...p,
      type: 'graph',
      id: newId(),
      z: this.scene.allocZ(),
      // Right of the formulas, centred on them vertically.
      ox: snap(box.maxX + 48 - b0.minX),
      oy: snap((box.minY + box.maxY) / 2 - (b0.minY + b0.maxY) / 2),
      color: '#1e1e1e',
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
    g.bbox = graphBBox(g)
    this.scene.add([g])
    useUI.setState({ tool: 'select' })
    this.setSelection([g])
    useUI.setState({ fnPanel: { id: g.id, session: Date.now() } })
  }

  /**
   * Live function edit from the function panel: the board shows it at once; all edits made during one
   * opening of the panel (`session`) are a single undo step.
   */
  setGraphFns(id: string, fns: PlotFn[], hideFormulas: boolean, session: number): void {
    const old = this.scene.getById([id])[0]
    if (!old || old.type !== 'graph') return
    const clean = sanitizeGraph({ ...old, fns, hideFormulas })
    const next: GraphItem = { ...old, ...clean }
    if (!clean.fns) delete next.fns
    if (!clean.hideFormulas) delete next.hideFormulas
    if (JSON.stringify(next.fns ?? []) === JSON.stringify(old.fns ?? []) && !!next.hideFormulas === !!old.hideFormulas) return
    next.bbox = graphBBox(next)
    this.scene.replaceMerged([old], [next], `fns:${id}:${session}`)
  }

  /** Fit a plane's axes to the curves drawn on it (undoable); false when there is nothing to fit to. */
  fitGraph(id: string): boolean {
    const old = this.scene.getById([id])[0]
    if (!old || old.type !== 'graph') return false
    const r = fitRanges(old)
    if (!r) return false
    if (r.xMin === old.xMin && r.xMax === old.xMax && r.yMin === old.yMin && r.yMax === old.yMax) return true
    this.updateGraph(id, { ...old, ...r })
    return true
  }

  /** Re-configure an inserted graph (undoable). */
  updateGraph(id: string, params: GraphParams): void {
    const old = this.scene.getById([id])[0]
    if (!old || old.type !== 'graph') return
    // The settings dialog does not edit the functions: the plane keeps its own (set by the function panel).
    const next: GraphItem = { ...old, ...sanitizeGraph({ ...params, fns: old.fns, hideFormulas: old.hideFormulas }) }
    next.bbox = graphBBox(next)
    this.scene.replace([old], [next])
  }

  // ---------------------------------------------------------------- instruments

  /** Show the ruler in the middle of the view, or hide it. */
  toggleRuler(): void {
    if (useUI.getState().ruler) {
      useUI.setState({ ruler: null })
      return
    }
    const { width, height } = this.view()
    const c = screenToWorld(this.camera, width / 2, height / 2)
    const maxCm = Math.max(4, Math.floor((width * 0.55) / this.camera.zoom / CM))
    const size = Math.min(12, maxCm) * CM
    useUI.setState({ ruler: { kind: 'ruler', x: c.x, y: c.y, rot: 0, size } })
  }

  /** Show a 45° or 30°/60° set square in the middle of the view, switch between them, or hide it. */
  toggleSetSquare(kind: 'square45' | 'square60'): void {
    const cur = useUI.getState().setSquare
    if (cur?.kind === kind) {
      useUI.setState({ setSquare: null })
      return
    }
    if (cur) {
      useUI.setState({ setSquare: { ...cur, kind } })
      return
    }
    const { width, height } = this.view()
    const c = screenToWorld(this.camera, width / 2, height / 2)
    const maxCm = Math.max(4, Math.floor((Math.min(width, height) * 0.42) / this.camera.zoom / CM))
    const size = Math.min(10, maxCm) * CM
    useUI.setState({ setSquare: { kind, x: c.x, y: c.y + size * 0.1, rot: 0, size } })
  }

  /** Show the compass in the middle of the view (legs open 4 cells), or hide it. */
  toggleCompass(): void {
    if (useUI.getState().compass) {
      useUI.setState({ compass: null })
      return
    }
    const { width, height } = this.view()
    const c = screenToWorld(this.camera, width / 2, height / 2)
    const r = Math.min(COMPASS_CELL * 4, (Math.min(width, height) * 0.25) / this.camera.zoom)
    useUI.setState({ compass: { x: c.x - r / 2, y: c.y + r * 0.3, r, a: 0 } })
  }

  toggleProtractor(): void {
    if (useUI.getState().protractor) {
      useUI.setState({ protractor: null })
      return
    }
    const { width, height } = this.view()
    const r = (Math.min(width, height) * 0.3) / this.camera.zoom
    const c = screenToWorld(this.camera, width / 2, height / 2)
    useUI.setState({ protractor: { x: c.x, y: c.y + r * 0.45, r, rot: 0 } })
  }

  // ---------------------------------------------------------------- templates

  /** Save the selection as a reusable template. */
  async saveSelectionAsTemplate(name: string): Promise<TemplateEntry | null> {
    const items = this.selectedItems()
    if (!items.length) return null
    const bg = useUI.getState().background
    const bytes = await encodeBoard({ items, background: bg, camera: this.camera })
    const thumb = await renderThumbnail(items, bg)
    const entry = await platform.library.saveTemplate(name, bytes, thumb)
    await this.refreshLibrary()
    return entry
  }

  /** Replace a template's content with the selection (the UI asks for confirmation first). */
  async replaceTemplateWithSelection(id: string): Promise<boolean> {
    const items = this.selectedItems()
    if (!items.length) return false
    const bg = useUI.getState().background
    const bytes = await encodeBoard({ items, background: bg, camera: this.camera })
    const thumb = await renderThumbnail(items, bg)
    const entry = await platform.library.replaceTemplate(id, bytes, thumb)
    // Drop the cached preview so the new one is shown.
    const old = this.templateUrls.get(id)
    if (old) URL.revokeObjectURL(old)
    this.templateUrls.delete(id)
    await this.refreshLibrary()
    return !!entry
  }

  async insertTemplate(id: string): Promise<void> {
    const { items } = await decodeBoard(await platform.library.loadTemplate(id))
    this.placeAtCenter(items)
  }

  async renameTemplate(id: string, name: string): Promise<void> {
    await platform.library.renameTemplate(id, name)
    await this.refreshLibrary()
  }

  async deleteTemplate(id: string): Promise<void> {
    await platform.library.deleteTemplate(id)
    await this.refreshLibrary()
  }

  private templateUrls = new Map<string, string | null>()
  async templateThumbUrl(id: string): Promise<string | null> {
    if (this.templateUrls.has(id)) return this.templateUrls.get(id) ?? null
    const bytes = await platform.library.templateThumb(id)
    const url = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' })) : null
    this.templateUrls.set(id, url)
    return url
  }

  // ---------------------------------------------------------------- images

  /** Insert image files at a screen point (defaults to the viewport centre). */
  async insertImages(files: File[], sx?: number, sy?: number): Promise<void> {
    const images = files.filter((f) => f.type.startsWith('image/'))
    let offset = 0
    const inserted: Item[] = []
    for (const file of images) {
      const src = await readFileAsDataURL(file)
      const img = await loadImage(src)
      const cam = this.camera
      const { width, height } = this.view()
      const center = screenToWorld(cam, sx ?? width / 2, sy ?? height / 2)
      // Fit into ~60% of the visible area, never upscale. The original pixels are kept as-is.
      const maxW = (width / cam.zoom) * 0.6
      const maxH = (height / cam.zoom) * 0.6
      const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      const x = center.x - w / 2 + offset
      const y = center.y - h / 2 + offset
      offset += 24 / cam.zoom
      const item: ImageItem = {
        type: 'image',
        id: newId(),
        z: this.scene.allocZ(),
        src,
        x,
        y,
        w,
        h,
        bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h }
      }
      this.scene.add([item])
      inserted.push(item)
    }
    if (inserted.length) {
      useUI.setState({ tool: 'select' })
      this.setSelection(inserted)
    }
  }

  // ---------------------------------------------------------------- autosave

  private boardData(): BoardData {
    return { items: [...this.scene.getItems()], background: useUI.getState().background, camera: this.camera }
  }

  private hasChanges(): boolean {
    return this.scene.version !== this.saved.version || this.metaVersion !== this.saved.meta
  }

  private cameraChanged(): boolean {
    const a = this.camera
    const b = this.saved.camera
    return a.x !== b.x || a.y !== b.y || a.zoom !== b.zoom
  }

  private markChanged(): void {
    if (!this.ready || !useUI.getState().board || !this.hasChanges()) return
    if (useUI.getState().saveStatus !== 'saving') useUI.setState({ saveStatus: 'pending' })
    this.scheduleSave()
  }

  private scheduleSave(): void {
    // Not reset by further edits: the first unsaved change starts the clock.
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS)
  }

  /**
   * Write the open board now. `final` = leaving the board (switch, home, close, sleep):
   * also refresh the thumbnail and remember the view position.
   */
  async flush(final = false): Promise<void> {
    // Text and formulas still being typed are part of the board.
    if (final) {
      this.commitText()
      this.commitFormula(false)
    }
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    while (this.saving) await this.saving
    const board = useUI.getState().board
    if (!board || !this.ready) return
    const thumbStale = this.scene.version !== this.thumbVersion || this.metaVersion !== this.saved.meta
    const needed = this.hasChanges() || (final && (this.cameraChanged() || thumbStale))
    if (!needed) {
      if (useUI.getState().saveStatus === 'pending') useUI.setState({ saveStatus: 'saved' })
      return
    }
    const version = this.scene.version
    const meta = this.metaVersion
    const camera = this.camera
    const data = this.boardData()
    useUI.setState({ saveStatus: 'saving' })
    this.saving = (async () => {
      try {
        const bytes = await encodeBoard(data)
        const wantThumb = thumbStale && (final || Date.now() - this.lastThumbAt > THUMB_INTERVAL_MS)
        const thumb = wantThumb ? await renderThumbnail(data.items, data.background) : null
        const r = await platform.library.save(board.id, bytes, thumb)
        this.saved = { version, meta, camera }
        if (thumb) {
          this.thumbVersion = version
          this.lastThumbAt = Date.now()
        }
        if (useUI.getState().board?.id === board.id) {
          useUI.setState({ saveStatus: r.ok ? 'saved' : 'error' })
        }
      } catch (err) {
        console.error('Autosave failed', err)
        useUI.setState({ saveStatus: 'error' })
      }
    })()
    await this.saving
    this.saving = null
    // Edits made while writing get their own save.
    if (this.hasChanges()) this.markChanged()
  }

  private updateTitle(): void {
    const { board, view } = useUI.getState()
    const name = view === 'home' || !board ? this.t('home.title') : board.title
    platform.setTitle(`${name} · Inkboard`)
  }

  /** Remember the running version; if it changed since last launch, show "Updated to X". */
  private async noticeUpdate(): Promise<void> {
    const version = await platform.update.version()
    useUI.setState({ appVersion: version })
    try {
      const prev = localStorage.getItem('inkboard-last-version')
      if (prev && prev !== version && version !== 'dev') useUI.setState({ justUpdatedTo: version })
      localStorage.setItem('inkboard-last-version', version)
    } catch {
      // storage unavailable: just skip the notice
    }
  }

  // ---------------------------------------------------------------- boards

  async refreshLibrary(): Promise<void> {
    useUI.setState({ library: await platform.library.list() })
  }

  /** Called once on startup: open the board the app was launched with, or the last one. */
  private started = false
  async start(): Promise<void> {
    // Guard against double start (React StrictMode runs effects twice in development).
    if (this.started) return
    this.started = true
    platform.onOpenBoard((id) => void this.refreshLibrary().then(() => this.openBoard(id)))
    void this.noticeUpdate()
    platform.onFlushRequest(() => this.flush(true))
    platform.onBeforeClose(() => this.flush(true))
    await this.refreshLibrary()
    const lib = useUI.getState().library
    const live = lib.boards.filter((b) => !b.deletedAt)
    const pending = await platform.library.takePendingOpen()
    if (pending) await this.refreshLibrary()
    const last = live.find((b) => b.id === lib.lastOpenedId)
    const recent = [...live].sort((a, b) => b.openedAt - a.openedAt)[0]
    const target = pending ?? last?.id ?? recent?.id
    if (target && (await this.openBoard(target))) return
    await this.newBoard()
  }

  private loadData(data: BoardData): void {
    this.preview = null
    useUI.setState({ selectedIds: [], background: data.background })
    this.scene.load(data.items)
    this.setCamera(data.camera)
  }

  /** Open a board from the library. Returns false if it couldn't be loaded. */
  async openBoard(id: string): Promise<boolean> {
    await this.flush(true)
    let entry = useUI.getState().library.boards.find((b) => b.id === id)
    if (!entry) {
      await this.refreshLibrary()
      entry = useUI.getState().library.boards.find((b) => b.id === id)
      if (!entry) return false
    }
    let data: BoardData
    try {
      data = await decodeBoard(await platform.library.load(id))
    } catch (err) {
      console.error('Could not open board', err)
      window.alert(`${this.t('file.openError')}\n${entry.title}`)
      return false
    }
    this.ready = false
    this.loadData(data)
    this.saved = { version: this.scene.version, meta: this.metaVersion, camera: this.camera }
    this.thumbVersion = this.scene.version
    this.lastThumbAt = 0
    useUI.setState({
      board: { id: entry.id, title: entry.title, kind: entry.kind, filePath: entry.filePath },
      view: 'board',
      saveStatus: 'saved'
    })
    this.ready = true
    await platform.library.setLastOpened(id)
    void this.refreshLibrary()
    return true
  }

  /** "Board of 11 Nov 2026, 18:30" in the UI language. */
  private newBoardTitle(): string {
    const lang = useUI.getState().lang
    const when = new Date().toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    return translate(lang, 'board.defaultName', { when })
  }

  async newBoard(): Promise<void> {
    await this.flush(true)
    // Show the empty board immediately; anything drawn while the library entry is being
    // created counts as an unsaved change of the new board (nothing gets lost).
    const empty: BoardData = { items: [], background: useUI.getState().background, camera: { ...DEFAULT_CAMERA } }
    this.ready = false
    useUI.setState({ board: null, view: 'board' })
    this.loadData(empty)
    const loadedVersion = this.scene.version
    const loadedMeta = this.metaVersion
    const entry = await platform.library.create(this.newBoardTitle(), await encodeBoard(empty))
    this.saved = { version: loadedVersion, meta: loadedMeta, camera: empty.camera }
    this.thumbVersion = loadedVersion
    this.lastThumbAt = 0
    useUI.setState({ board: { id: entry.id, title: entry.title, kind: entry.kind }, saveStatus: 'saved' })
    this.ready = true
    if (this.hasChanges()) this.markChanged()
    await platform.library.setLastOpened(entry.id)
    void this.refreshLibrary()
  }

  async goHome(): Promise<void> {
    this.clearSelection()
    await this.flush(true)
    await this.refreshLibrary()
    useUI.setState({ view: 'home' })
  }

  async renameBoard(id: string, title: string): Promise<void> {
    const entry = await platform.library.rename(id, title)
    const b = useUI.getState().board
    if (b?.id === id) useUI.setState({ board: { ...b, title: entry.title, filePath: entry.filePath } })
    await this.refreshLibrary()
  }

  async deleteBoard(id: string): Promise<void> {
    const wasOpen = useUI.getState().board?.id === id
    if (wasOpen) await this.flush(true)
    await platform.library.remove(id)
    if (wasOpen) useUI.setState({ board: null })
    await this.refreshLibrary()
  }

  /** Ctrl+S: save immediately to the library database. */
  async save(): Promise<void> {
    if (!useUI.getState().board) return
    await this.flush(true)
  }

  /** Export the open board (or a board by id from the home screen) to a standalone .inkboard file. */
  async saveAsFile(boardId?: string): Promise<void> {
    const open = useUI.getState().board
    const targetId = boardId ?? open?.id
    if (!targetId) return
    if (open && targetId === open.id) {
      await this.flush(true)
      const entry = await platform.library.saveAsFile(open.id, await encodeBoard(this.boardData()), open.title)
      if (!entry) return
      useUI.setState({ board: { id: entry.id, title: entry.title, kind: entry.kind, filePath: entry.filePath } })
    } else {
      const target = useUI.getState().library.boards.find((b) => b.id === targetId)
      if (!target) return
      const bytes = await platform.library.load(targetId)
      await platform.library.saveAsFile(targetId, bytes, target.title)
    }
    await this.refreshLibrary()
  }

  async openFile(): Promise<void> {
    const entry = await platform.library.importFile()
    if (!entry) return
    await this.refreshLibrary()
    await this.openBoard(entry.id)
  }

  // ---------------------------------------------------------------- export & backup

  /** Export the selection if there is one, otherwise the whole board. */
  async exportBoard(kind: 'png' | 'pdf'): Promise<void> {
    const sel = this.selectedItems()
    const items = sel.length ? sel : [...this.scene.getItems()]
    const bg = useUI.getState().background
    const title = useUI.getState().board?.title ?? 'Inkboard'
    try {
      if (kind === 'png') {
        const png = await renderPng(items, bg)
        await platform.exportFile('png', png.bytes, title, png.width, png.height)
      } else {
        const { svg, width, height } = renderSvg(items, bg)
        await platform.exportFile('pdf', svg, title, width, height)
      }
    } catch (err) {
      console.error('Export failed', err)
      window.alert(this.t('export.error'))
    }
  }

  async chooseBackupDir(): Promise<void> {
    await this.flush(true)
    await platform.chooseBackupDir()
    await this.refreshLibrary()
  }

  async disableBackup(): Promise<void> {
    await platform.disableBackup()
    await this.refreshLibrary()
  }

  /** Thumbnail bytes → object URL, cached per board + modification time. */
  private thumbUrls = new Map<string, { key: number; url: string | null }>()
  async thumbUrl(entry: BoardEntry): Promise<string | null> {
    const cached = this.thumbUrls.get(entry.id)
    if (cached && cached.key === entry.updatedAt) return cached.url
    const bytes = await platform.library.thumb(entry.id)
    if (cached?.url) URL.revokeObjectURL(cached.url)
    const url = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' })) : null
    this.thumbUrls.set(entry.id, { key: entry.updatedAt, url })
    return url
  }
}

export const editor = new Editor()

// Dev builds only: lets UI tests in the browser inspect the board state.
if (import.meta.env.DEV) {
  const w = window as unknown as { __inkboard: Editor; __inkboardUI: typeof useUI }
  w.__inkboard = editor
  w.__inkboardUI = useUI
}
