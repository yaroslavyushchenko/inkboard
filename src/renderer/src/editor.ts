import type { BoardEntry } from '../../shared/library'
import { clampZoom, screenToWorld, zoomAt } from './engine/camera'
import { renderPng, renderSvg, renderThumbnail } from './engine/export'
import { newId } from './engine/geometry'
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
import { applyXform, unionBBox, type Xform } from './engine/transform'
import type { BBox, Camera, ImageItem, Item } from './engine/types'
import { translate, type MessageKey } from './i18n'
import { platform } from './platform'
import { useUI } from './store'

const CLIPBOARD_MIME = 'application/x-inkboard'
/** Autosave: wait for a 1 s pause in editing, but never longer than 5 s after the first unsaved change. */
const SAVE_DEBOUNCE_MS = 1000
const SAVE_MAX_WAIT_MS = 5000
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
  private firstPendingAt: number | null = null
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
    const now = Date.now()
    if (this.firstPendingAt === null) this.firstPendingAt = now
    if (this.saveTimer) clearTimeout(this.saveTimer)
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, this.firstPendingAt + SAVE_MAX_WAIT_MS - now))
    this.saveTimer = setTimeout(() => void this.flush(), wait)
  }

  /**
   * Write the open board now. `final` = leaving the board (switch, home, close, sleep):
   * also refresh the thumbnail and remember the view position.
   */
  async flush(final = false): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.firstPendingAt = null
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
    platform.setTitle(`${name} — Inkboard`)
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
      saveStatus: 'saved',
      historyOpen: false
    })
    this.ready = true
    await platform.library.setLastOpened(id)
    void this.refreshLibrary()
    return true
  }

  /** "Board — 11 Nov 2026, 18:30" in the UI language. */
  private newBoardTitle(): string {
    const lang = useUI.getState().lang
    const when = new Date().toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    return `${this.t('board.defaultName')} — ${when}`
  }

  async newBoard(): Promise<void> {
    await this.flush(true)
    const bytes = await encodeBoard({ items: [], background: useUI.getState().background, camera: DEFAULT_CAMERA })
    const entry = await platform.library.create(this.newBoardTitle(), bytes)
    await this.refreshLibrary()
    await this.openBoard(entry.id)
  }

  async goHome(): Promise<void> {
    this.clearSelection()
    await this.flush(true)
    await this.refreshLibrary()
    useUI.setState({ view: 'home', historyOpen: false })
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

  /** Ctrl+S: drafts get a "Save as file" dialog; file-backed boards are written immediately. */
  async save(): Promise<void> {
    const b = useUI.getState().board
    if (!b) return
    if (b.kind === 'draft') await this.saveAsFile()
    else await this.flush(true)
  }

  async saveAsFile(): Promise<void> {
    const b = useUI.getState().board
    if (!b) return
    await this.flush(true)
    const entry = await platform.library.saveAsFile(b.id, await encodeBoard(this.boardData()), b.title)
    if (!entry) return
    useUI.setState({ board: { id: entry.id, title: entry.title, kind: entry.kind, filePath: entry.filePath } })
    await this.refreshLibrary()
  }

  async openFile(): Promise<void> {
    const entry = await platform.library.importFile()
    if (!entry) return
    await this.refreshLibrary()
    await this.openBoard(entry.id)
  }

  /** Restore a version-history snapshot. The current state is snapshotted first and Ctrl+Z undoes it. */
  async restoreVersion(ts: number): Promise<void> {
    const b = useUI.getState().board
    if (!b) return
    await this.flush(true)
    await platform.library.snapshot(b.id, await encodeBoard(this.boardData()))
    const data = await decodeBoard(await platform.library.loadVersion(b.id, ts))
    this.clearSelection()
    this.scene.replace([...this.scene.getItems()], data.items)
    useUI.setState({ background: data.background })
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
