import type { BoardEntry, TemplateEntry } from '../../shared/library'
import { DEFAULT_CAMERA, editor } from '../../board/editor'
import { renderPng, renderSvg, renderThumbnail } from '../../board/engine/export'
import { decodeBoard, encodeBoard, type BoardData } from '../../board/engine/serialize'
import { translate } from '../../board/i18n'
import { useUI } from '../../board/store'
import { platform } from './platform'

/**
 * Autosave: write at most 5 s after the first unsaved change, even while drawing non-stop, so a crash
 * or power cut loses at most 5 s of work. Leaving the board, closing the app, sleep and Ctrl+S save
 * right away.
 */
const SAVE_DELAY_MS = 5000
/** Thumbnails are re-rendered at most this often while editing (always on leaving a board). */
const THUMB_INTERVAL_MS = 10_000

class BoardLibrary {
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
    editor.scene.subscribe(() => this.markChanged())
    useUI.subscribe((s, prev) => {
      if (s.background !== prev.background) {
        this.metaVersion++
        this.markChanged()
      }
      if (s.lang !== prev.lang || s.board !== prev.board || s.view !== prev.view) this.updateTitle()
    })
  }

  // ---------------------------------------------------------------- templates

  /** Save the selection as a reusable template. */
  async saveSelectionAsTemplate(name: string): Promise<TemplateEntry | null> {
    const items = editor.selectedItems()
    if (!items.length) return null
    const bg = useUI.getState().background
    const bytes = await encodeBoard({ items, background: bg, camera: editor.camera })
    const thumb = await renderThumbnail(items, bg)
    const entry = await platform.library.saveTemplate(name, bytes, thumb)
    await this.refreshLibrary()
    return entry
  }

  /** Replace a template's content with the selection (the UI asks for confirmation first). */
  async replaceTemplateWithSelection(id: string): Promise<boolean> {
    const items = editor.selectedItems()
    if (!items.length) return false
    const bg = useUI.getState().background
    const bytes = await encodeBoard({ items, background: bg, camera: editor.camera })
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
    editor.placeAtCenter(items)
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

  // ---------------------------------------------------------------- autosave

  private boardData(): BoardData {
    return { items: [...editor.scene.getItems()], background: useUI.getState().background, camera: editor.camera }
  }

  private hasChanges(): boolean {
    return editor.scene.version !== this.saved.version || this.metaVersion !== this.saved.meta
  }

  private cameraChanged(): boolean {
    const a = editor.camera
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
      editor.commitText()
      editor.commitFormula(false)
    }
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    while (this.saving) await this.saving
    const board = useUI.getState().board
    if (!board || !this.ready) return
    const thumbStale = editor.scene.version !== this.thumbVersion || this.metaVersion !== this.saved.meta
    const needed = this.hasChanges() || (final && (this.cameraChanged() || thumbStale))
    if (!needed) {
      if (useUI.getState().saveStatus === 'pending') useUI.setState({ saveStatus: 'saved' })
      return
    }
    const version = editor.scene.version
    const meta = this.metaVersion
    const camera = editor.camera
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
    const name = view === 'home' || !board ? editor.t('home.title') : board.title
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
      window.alert(`${editor.t('file.openError')}\n${entry.title}`)
      return false
    }
    this.ready = false
    editor.loadData(data)
    this.saved = { version: editor.scene.version, meta: this.metaVersion, camera: editor.camera }
    this.thumbVersion = editor.scene.version
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
    editor.loadData(empty)
    const loadedVersion = editor.scene.version
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
    editor.clearSelection()
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
    const sel = editor.selectedItems()
    const items = sel.length ? sel : [...editor.scene.getItems()]
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
      window.alert(editor.t('export.error'))
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

export const boardLibrary = new BoardLibrary()
