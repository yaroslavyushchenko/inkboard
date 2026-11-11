import { randomUUID } from 'node:crypto'
import { access, copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import {
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOTS_KEPT,
  TRASH_DAYS,
  type BoardEntry,
  type LibraryState,
  type Tag,
  type TemplateEntry,
  type VersionInfo
} from '../shared/library'
import { isValidBoard, readDurable, removeWithBackup, safeFileName, writeDurable } from './fsutil'

interface IndexFile extends LibraryState {
  version: 1
}

const BACKUP_THROTTLE_MS = 30_000
const DAY = 24 * 60 * 60 * 1000

/**
 * The board library: an index of every board (drafts kept in the app folder + tracked .inkboard files),
 * thumbnails, version-history snapshots, "Recently deleted", tags and the optional backup mirror.
 *
 * Layout under `root`:
 *   index.json, boards/<id>.inkboard, thumbs/<id>.webp, history/<id>/<ts>.inkboard
 */
export class Library {
  private index: IndexFile = { version: 1, boards: [], tags: [], templates: [], lastOpenedId: null, backupDir: null }
  private lastBackup = new Map<string, number>()
  /** Serialises index writes so concurrent IPC calls can't interleave. */
  private writeChain: Promise<void> = Promise.resolve()
  private snapshotMs: number

  constructor(
    private root: string,
    snapshotMs = SNAPSHOT_INTERVAL_MS
  ) {
    this.snapshotMs = snapshotMs
  }

  private p = {
    index: (): string => join(this.root, 'index.json'),
    board: (id: string): string => join(this.root, 'boards', `${id}.inkboard`),
    thumb: (id: string): string => join(this.root, 'thumbs', `${id}.webp`),
    history: (id: string): string => join(this.root, 'history', id),
    template: (id: string): string => join(this.root, 'templates', `${id}.inkboard`),
    templateThumb: (id: string): string => join(this.root, 'templates', `${id}.webp`)
  }

  // ------------------------------------------------------------------ lifecycle

  async init(legacyRecovery?: { bytes: string; meta: string }): Promise<void> {
    await mkdir(join(this.root, 'boards'), { recursive: true })
    await mkdir(join(this.root, 'thumbs'), { recursive: true })
    await mkdir(join(this.root, 'history'), { recursive: true })
    await mkdir(join(this.root, 'templates'), { recursive: true })
    try {
      const buf = await readDurable(this.p.index(), (b) => {
        try {
          return JSON.parse(b.toString('utf8')).version === 1
        } catch {
          return false
        }
      })
      this.index = { ...this.index, ...JSON.parse(buf.toString('utf8')) }
      this.index.templates ??= []
    } catch {
      // First run (or unreadable index): start empty, then migrate the 0.1 autosave if present.
      if (legacyRecovery) await this.migrateLegacy(legacyRecovery.bytes, legacyRecovery.meta)
    }
    await this.purgeExpired()
  }

  /** 0.1 kept one autosave slot (recovery.inkboard + recovery.json). Turn it into a library entry. */
  private async migrateLegacy(bytesPath: string, metaPath: string): Promise<void> {
    try {
      const bytes = await readFile(bytesPath)
      if (!isValidBoard(bytes)) return
      let meta: { filePath?: string | null; fileName?: string | null } = {}
      try {
        meta = JSON.parse(await readFile(metaPath, 'utf8'))
      } catch {
        // no meta
      }
      const now = Date.now()
      const id = randomUUID()
      const entry: BoardEntry = {
        id,
        title: meta.fileName ? meta.fileName.replace(/\.inkboard$/i, '') : 'Board',
        kind: 'draft',
        createdAt: now,
        updatedAt: now,
        openedAt: now,
        tagIds: []
      }
      // Always keep the autosaved content as a draft (it may be newer than the saved file).
      await writeDurable(this.p.board(id), bytes)
      this.index.boards.push(entry)
      this.index.lastOpenedId = id
      await this.writeIndex()
      await rm(bytesPath, { force: true })
      await rm(metaPath, { force: true })
    } catch (err) {
      console.error('Legacy migration failed', err)
    }
  }

  private async purgeExpired(): Promise<void> {
    const limit = Date.now() - TRASH_DAYS * DAY
    const expired = this.index.boards.filter((b) => b.deletedAt && b.deletedAt < limit)
    for (const b of expired) await this.purge(b.id)
  }

  private writeIndex(): Promise<void> {
    const snapshot = JSON.stringify(this.index, null, 1)
    this.writeChain = this.writeChain.then(() => writeDurable(this.p.index(), snapshot)).catch((e) => {
      console.error('Could not write library index', e)
    })
    return this.writeChain
  }

  private get(id: string): BoardEntry {
    const b = this.index.boards.find((x) => x.id === id)
    if (!b) throw new Error(`Unknown board ${id}`)
    return b
  }

  // ------------------------------------------------------------------ queries

  async list(): Promise<LibraryState> {
    const boards = await Promise.all(
      this.index.boards.map(async (b) => {
        if (b.kind !== 'file' || !b.filePath) return { ...b }
        try {
          await access(b.filePath)
          return { ...b, missing: false }
        } catch {
          return { ...b, missing: true }
        }
      })
    )
    return { ...this.index, boards }
  }

  async thumb(id: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.p.thumb(id)))
    } catch {
      return null
    }
  }

  // ------------------------------------------------------------------ board contents

  async create(title: string, bytes: Uint8Array): Promise<BoardEntry> {
    const now = Date.now()
    const entry: BoardEntry = { id: randomUUID(), title, kind: 'draft', createdAt: now, updatedAt: now, openedAt: now, tagIds: [] }
    await writeDurable(this.p.board(entry.id), bytes)
    this.index.boards.push(entry)
    this.index.lastOpenedId = entry.id
    await this.writeIndex()
    return entry
  }

  /** Board bytes. For a file-backed board whose file is gone, falls back to the emergency copy. */
  async load(id: string): Promise<Uint8Array> {
    const b = this.get(id)
    if (b.kind === 'file' && b.filePath) {
      try {
        return new Uint8Array(await readDurable(b.filePath, isValidBoard))
      } catch {
        // File missing / unreadable: try the emergency copy written when saving to it failed.
      }
    }
    return new Uint8Array(await readDurable(this.p.board(id), isValidBoard))
  }

  /** Autosave. Returns false if the board's own file couldn't be written (an emergency copy was kept). */
  async save(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<{ ok: boolean; updatedAt: number }> {
    const b = this.get(id)
    let ok = true
    if (b.kind === 'file' && b.filePath) {
      try {
        await writeDurable(b.filePath, bytes)
        // A successful file write makes any emergency copy obsolete.
        await removeWithBackup(this.p.board(id))
      } catch (err) {
        console.error('Could not write board file, keeping emergency copy', err)
        ok = false
        await writeDurable(this.p.board(id), bytes)
      }
    } else {
      await writeDurable(this.p.board(id), bytes)
    }
    if (thumb) await writeDurable(this.p.thumb(id), thumb)
    b.updatedAt = Date.now()
    await this.writeIndex()
    await this.maybeSnapshot(id, bytes)
    void this.mirrorToBackup(b, bytes)
    return { ok, updatedAt: b.updatedAt }
  }

  async setLastOpened(id: string): Promise<void> {
    const b = this.get(id)
    b.openedAt = Date.now()
    this.index.lastOpenedId = id
    await this.writeIndex()
  }

  // ------------------------------------------------------------------ entry management

  async rename(id: string, title: string): Promise<BoardEntry> {
    const b = this.get(id)
    const clean = title.trim() || b.title
    if (b.kind === 'file' && b.filePath) {
      // Rename the file next to itself; keep the old name if the new one is taken.
      const target = join(dirname(b.filePath), `${safeFileName(clean)}.inkboard`)
      if (target !== b.filePath) {
        try {
          await access(target)
        } catch {
          await rename(b.filePath, target)
          await rm(`${b.filePath}.bak`, { force: true })
          b.filePath = target
        }
      }
    }
    await this.removeBackupMirror(b)
    b.title = clean
    await this.writeIndex()
    return { ...b }
  }

  async duplicate(id: string): Promise<BoardEntry> {
    const src = this.get(id)
    const bytes = await this.load(id)
    const copy = await this.create(`${src.title} (copy)`, bytes)
    copy.tagIds = [...src.tagIds]
    try {
      await copyFile(this.p.thumb(id), this.p.thumb(copy.id))
    } catch {
      // no thumbnail yet
    }
    await this.writeIndex()
    return { ...copy }
  }

  async pin(id: string, on: boolean): Promise<void> {
    this.get(id).pinned = on || undefined
    await this.writeIndex()
  }

  async setTags(id: string, tagIds: string[]): Promise<void> {
    this.get(id).tagIds = tagIds.filter((t) => this.index.tags.some((x) => x.id === t))
    await this.writeIndex()
  }

  async createTag(name: string, color: string): Promise<Tag> {
    const tag: Tag = { id: randomUUID(), name: name.trim() || 'Tag', color }
    this.index.tags.push(tag)
    await this.writeIndex()
    return tag
  }

  async updateTag(id: string, patch: Partial<Omit<Tag, 'id'>>): Promise<void> {
    const t = this.index.tags.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, patch)
    await this.writeIndex()
  }

  async deleteTag(id: string): Promise<void> {
    this.index.tags = this.index.tags.filter((t) => t.id !== id)
    for (const b of this.index.boards) b.tagIds = b.tagIds.filter((t) => t !== id)
    await this.writeIndex()
  }

  /** Move to "Recently deleted". The user's own .inkboard file is never deleted by the app. */
  async remove(id: string): Promise<void> {
    this.get(id).deletedAt = Date.now()
    if (this.index.lastOpenedId === id) this.index.lastOpenedId = null
    await this.writeIndex()
  }

  async restore(id: string): Promise<void> {
    delete this.get(id).deletedAt
    await this.writeIndex()
  }

  /** Delete forever: library copies, thumbnail and history. A tracked file stays on disk. */
  async purge(id: string): Promise<void> {
    await removeWithBackup(this.p.board(id))
    await rm(this.p.thumb(id), { force: true })
    await rm(this.p.history(id), { recursive: true, force: true })
    this.index.boards = this.index.boards.filter((b) => b.id !== id)
    if (this.index.lastOpenedId === id) this.index.lastOpenedId = null
    await this.writeIndex()
  }

  // ------------------------------------------------------------------ files on disk

  /** Turn a draft into a file-backed board (or move a file-backed board) at `path`. */
  async saveAsFile(id: string, path: string, bytes: Uint8Array): Promise<BoardEntry> {
    const b = this.get(id)
    await writeDurable(path, bytes)
    if (b.kind === 'draft') await removeWithBackup(this.p.board(id))
    b.kind = 'file'
    b.filePath = path
    b.title = basename(path, extname(path))
    b.updatedAt = Date.now()
    await this.writeIndex()
    return { ...b }
  }

  /** Track an existing .inkboard file (returns the existing entry if it's already in the library). */
  async importFile(path: string): Promise<BoardEntry> {
    const existing = this.index.boards.find((b) => b.filePath === path)
    if (existing) {
      delete existing.deletedAt
      await this.writeIndex()
      return { ...existing }
    }
    await readDurable(path, isValidBoard) // validates it's a readable Inkboard file
    const st = await stat(path)
    const now = Date.now()
    const entry: BoardEntry = {
      id: randomUUID(),
      title: basename(path, extname(path)),
      kind: 'file',
      filePath: path,
      createdAt: st.birthtimeMs || now,
      updatedAt: st.mtimeMs || now,
      openedAt: now,
      tagIds: []
    }
    this.index.boards.push(entry)
    await this.writeIndex()
    return { ...entry }
  }

  async locate(id: string, path: string): Promise<BoardEntry> {
    const b = this.get(id)
    await readDurable(path, isValidBoard)
    b.filePath = path
    b.kind = 'file'
    await this.writeIndex()
    return { ...b }
  }

  filePath(id: string): string | undefined {
    return this.get(id).filePath
  }

  // ------------------------------------------------------------------ version history

  private async snapshots(id: string): Promise<number[]> {
    try {
      const names = await readdir(this.p.history(id))
      return names
        .filter((n) => n.endsWith('.inkboard'))
        .map((n) => Number(n.replace('.inkboard', '')))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => b - a)
    } catch {
      return []
    }
  }

  private async maybeSnapshot(id: string, bytes: Uint8Array): Promise<void> {
    const list = await this.snapshots(id)
    if (list.length && Date.now() - list[0] < this.snapshotMs) return
    await this.snapshotNow(id, bytes)
  }

  async snapshotNow(id: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.p.history(id), { recursive: true })
    await writeDurable(join(this.p.history(id), `${Date.now()}.inkboard`), bytes)
    const list = await this.snapshots(id)
    for (const ts of list.slice(SNAPSHOTS_KEPT)) await removeWithBackup(join(this.p.history(id), `${ts}.inkboard`))
  }

  async listVersions(id: string): Promise<VersionInfo[]> {
    const out: VersionInfo[] = []
    for (const ts of await this.snapshots(id)) {
      try {
        const st = await stat(join(this.p.history(id), `${ts}.inkboard`))
        out.push({ ts, size: st.size })
      } catch {
        // vanished
      }
    }
    return out
  }

  async loadVersion(id: string, ts: number): Promise<Uint8Array> {
    return new Uint8Array(await readDurable(join(this.p.history(id), `${ts}.inkboard`), isValidBoard))
  }

  // ------------------------------------------------------------------ templates

  async saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry> {
    const entry: TemplateEntry = { id: randomUUID(), name: name.trim() || 'Template', createdAt: Date.now() }
    await writeDurable(this.p.template(entry.id), bytes)
    if (thumb) await writeDurable(this.p.templateThumb(entry.id), thumb)
    this.index.templates.push(entry)
    await this.writeIndex()
    return entry
  }

  /** Overwrite a template's content (the previous version stays as `.bak` next to it). */
  async replaceTemplate(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry | null> {
    const t = this.index.templates.find((x) => x.id === id)
    if (!t) return null
    await writeDurable(this.p.template(id), bytes)
    if (thumb) await writeDurable(this.p.templateThumb(id), thumb)
    t.updatedAt = Date.now()
    await this.writeIndex()
    return t
  }

  async loadTemplate(id: string): Promise<Uint8Array> {
    return new Uint8Array(await readDurable(this.p.template(id), isValidBoard))
  }

  async templateThumb(id: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.p.templateThumb(id)))
    } catch {
      return null
    }
  }

  async renameTemplate(id: string, name: string): Promise<void> {
    const t = this.index.templates.find((x) => x.id === id)
    if (t && name.trim()) t.name = name.trim()
    await this.writeIndex()
  }

  async deleteTemplate(id: string): Promise<void> {
    this.index.templates = this.index.templates.filter((t) => t.id !== id)
    await removeWithBackup(this.p.template(id))
    await rm(this.p.templateThumb(id), { force: true })
    await this.writeIndex()
  }

  // ------------------------------------------------------------------ backup mirror

  get backupDir(): string | null {
    return this.index.backupDir
  }

  async setBackupDir(dir: string | null): Promise<void> {
    this.index.backupDir = dir
    this.lastBackup.clear()
    await this.writeIndex()
    if (!dir) return
    // Mirror everything right away so the backup is complete from the start.
    for (const b of this.index.boards) {
      if (b.deletedAt) continue
      try {
        await this.mirrorToBackup(b, await this.load(b.id), true)
      } catch (err) {
        console.error('Backup of', b.title, 'failed', err)
      }
    }
  }

  private backupName(b: BoardEntry): string {
    return `${safeFileName(b.title)} (${b.id.slice(0, 6)}).inkboard`
  }

  private async mirrorToBackup(b: BoardEntry, bytes: Uint8Array, force = false): Promise<void> {
    const dir = this.index.backupDir
    if (!dir) return
    const last = this.lastBackup.get(b.id) ?? 0
    if (!force && Date.now() - last < BACKUP_THROTTLE_MS) return
    this.lastBackup.set(b.id, Date.now())
    try {
      await writeDurable(join(dir, this.backupName(b)), bytes)
    } catch (err) {
      // USB stick unplugged etc. — never let the backup break normal saving.
      console.error('Backup mirror failed', err)
    }
  }

  private async removeBackupMirror(b: BoardEntry): Promise<void> {
    const dir = this.index.backupDir
    if (!dir) return
    await removeWithBackup(join(dir, this.backupName(b))).catch(() => {})
    this.lastBackup.delete(b.id)
  }
}
