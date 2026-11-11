import { clampZoom, screenToWorld, zoomAt } from './engine/camera'
import { newId } from './engine/geometry'
import { loadImage, readFileAsDataURL } from './engine/images'
import { Scene } from './engine/scene'
import { decodeBoard, encodeBoard, serializeBoard, deserializeBoard, type BoardFile } from './engine/serialize'
import { applyXform, unionBBox, type Xform } from './engine/transform'
import type { BBox, Camera, ImageItem, Item } from './engine/types'
import { translate } from './i18n'
import { platform } from './platform'
import { useUI } from './store'

const CLIPBOARD_MIME = 'application/x-inkboard'
const AUTOSAVE_DELAY_MS = 1500

/**
 * Glue between the imperative board engine and the React UI.
 * UI components call these methods; the Board component registers the render callback.
 */
class Editor {
  readonly scene = new Scene()
  camera: Camera = { x: -80, y: -80, zoom: 1 }
  viewport = { width: 0, height: 0 }
  /** Live move/scale of the selection, drawn without touching the scene until committed. */
  preview: { ids: ReadonlySet<string>; t: Xform } | null = null

  private invalidate: (base?: boolean) => void = () => {}
  private filePath: string | null = null
  private savedVersion = 0
  private backgroundDirty = false
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null
  private ready = false

  constructor() {
    this.scene.subscribe(() => {
      // Drop selected ids that no longer exist (e.g. after undo).
      const sel = useUI.getState().selectedIds
      const alive = sel.length ? this.scene.getById(sel).map((i) => i.id) : sel
      useUI.setState({
        canUndo: this.scene.canUndo,
        canRedo: this.scene.canRedo,
        selectedIds: alive.length === sel.length ? sel : alive
      })
      this.markChanged()
      this.invalidate(true)
    })
    useUI.subscribe((s, prev) => {
      if (s.background !== prev.background) {
        this.backgroundDirty = true
        this.markChanged()
        this.invalidate(true)
      } else if (s.selectedIds !== prev.selectedIds || s.tool !== prev.tool) {
        this.invalidate(false)
      }
      if (s.lang !== prev.lang || s.fileName !== prev.fileName || s.dirty !== prev.dirty) this.updateTitle()
    })
    platform.onBeforeClose(() => this.writeRecovery())
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

  t(key: Parameters<typeof translate>[1]): string {
    return translate(useUI.getState().lang, key)
  }

  // ---------------------------------------------------------------- camera

  setCamera(cam: Camera): void {
    this.camera = cam
    useUI.setState({ camera: cam, zoom: cam.zoom })
    this.invalidate(true)
  }

  zoomBy(factor: number): void {
    const { width, height } = this.viewport
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

  setSelection(items: Item[]): void {
    useUI.setState({ selectedIds: items.map((i) => i.id) })
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

  deleteSelection(): void {
    const items = this.selectedItems()
    this.clearSelection()
    this.scene.remove(items)
  }

  /** Copies of `items` with fresh ids, on top of everything, shifted by (dx, dy). */
  private cloneItems(items: Item[], dx: number, dy: number): Item[] {
    return [...items]
      .sort((a, b) => a.z - b.z)
      .map((it) => ({ ...applyXform(it, { s: 1, ax: 0, ay: 0, dx, dy }), id: newId(), z: this.scene.allocZ() }))
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
    e.clipboardData.setData('text/plain', JSON.stringify(file))
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
        const box = unionBBox(items)
        if (box) {
          const c = screenToWorld(this.camera, this.viewport.width / 2, this.viewport.height / 2)
          const copies = this.cloneItems(items, c.x - (box.minX + box.maxX) / 2, c.y - (box.minY + box.maxY) / 2)
          this.scene.add(copies)
          useUI.setState({ tool: 'select' })
          this.setSelection(copies)
        }
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
    return false
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
      const { width, height } = this.viewport
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

  // ---------------------------------------------------------------- files

  private boardData(): { items: Item[]; background: ReturnType<typeof useUI.getState>['background']; camera: Camera } {
    return { items: [...this.scene.getItems()], background: useUI.getState().background, camera: this.camera }
  }

  private isDirty(): boolean {
    return this.scene.version !== this.savedVersion || this.backgroundDirty
  }

  private markChanged(): void {
    if (!this.ready) return
    const dirty = this.isDirty()
    if (useUI.getState().dirty !== dirty) useUI.setState({ dirty })
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = setTimeout(() => void this.writeRecovery(), AUTOSAVE_DELAY_MS)
  }

  private markSaved(path: string | null, name: string | null): void {
    this.filePath = path
    this.savedVersion = this.scene.version
    this.backgroundDirty = false
    useUI.setState({ fileName: name, dirty: false })
  }

  private updateTitle(): void {
    const { fileName, dirty } = useUI.getState()
    const name = fileName ?? this.t('file.untitled')
    platform.setTitle(`${dirty ? '• ' : ''}${name} — Inkboard`)
  }

  /** Autosave the current board so the app reopens exactly where it was left (like Whiteboard). */
  async writeRecovery(): Promise<void> {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = null
    if (!this.ready) return
    const bytes = await encodeBoard(this.boardData())
    const { fileName, dirty } = useUI.getState()
    await platform.writeRecovery(bytes, { filePath: this.filePath, fileName, dirty })
  }

  private loadBoard(data: Awaited<ReturnType<typeof decodeBoard>>): void {
    this.preview = null
    useUI.setState({ selectedIds: [], background: data.background })
    this.scene.load(data.items)
    this.setCamera(data.camera)
  }

  /** Restore the autosaved board on startup. */
  async restore(): Promise<void> {
    try {
      const rec = await platform.readRecovery()
      if (rec) {
        this.loadBoard(await decodeBoard(rec.bytes))
        this.markSaved(rec.meta.filePath, rec.meta.fileName)
        // Keep the "unsaved" marker if the board had unsaved edits when the app was closed.
        if (rec.meta.dirty) this.backgroundDirty = true
      }
    } catch (err) {
      console.error('Could not restore the last board', err)
    }
    this.ready = true
    useUI.setState({ dirty: this.isDirty() })
    this.updateTitle()
  }

  /** If there are unsaved edits, ask Save / Don't save / Cancel. Returns false if cancelled. */
  private async confirmLoseChanges(): Promise<boolean> {
    if (!this.isDirty() || this.scene.getItems().length === 0) return true
    const answer = await platform.confirmDiscard({
      message: this.t('file.unsavedPrompt'),
      save: this.t('file.save'),
      dontSave: this.t('file.dontSave'),
      cancel: this.t('file.cancel')
    })
    if (answer === 'cancel') return false
    if (answer === 'save') return this.save()
    return true
  }

  async newBoard(): Promise<void> {
    if (!(await this.confirmLoseChanges())) return
    this.loadBoard({ items: [], background: useUI.getState().background, camera: { x: -80, y: -80, zoom: 1 } })
    this.markSaved(null, null)
    void this.writeRecovery()
  }

  async open(): Promise<void> {
    if (!(await this.confirmLoseChanges())) return
    const file = await platform.openFile()
    if (!file) return
    try {
      this.loadBoard(await decodeBoard(file.bytes))
      this.markSaved(file.path, file.name)
      void this.writeRecovery()
    } catch (err) {
      window.alert(`${this.t('file.openError')}\n${(err as Error).message}`)
    }
  }

  /** Save to the current file (or ask for a path). Returns true if saved. */
  async save(saveAs = false): Promise<boolean> {
    const bytes = await encodeBoard(this.boardData())
    const suggested = useUI.getState().fileName ?? `${this.t('file.untitled')}.inkboard`
    const result = await platform.saveFile(bytes, saveAs ? null : this.filePath, suggested)
    if (!result) return false
    this.markSaved(result.path, result.name)
    void this.writeRecovery()
    return true
  }
}

export const editor = new Editor()
