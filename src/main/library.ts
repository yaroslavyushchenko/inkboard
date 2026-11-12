import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { TRASH_DAYS, type BoardEntry, type LibraryState, type Tag, type TemplateEntry } from '../shared/library'
import { isValidBoard, parseBoardBuffer, readDurable, removeWithBackup, safeFileName, writeDurable } from './fsutil'

/** A board entry as the 0.2-0.6 `index.json` stored it. */
interface LegacyBoardEntry {
  id: string
  title: string
  kind?: 'draft' | 'file'
  filePath?: string
  createdAt?: number
  updatedAt?: number
  openedAt?: number
  pinned?: boolean
  deletedAt?: number
  tagIds?: string[]
}

interface LegacyIndexFile {
  version: 1
  boards?: LegacyBoardEntry[]
  tags?: Tag[]
  templates?: TemplateEntry[]
  lastOpenedId?: string | null
  backupDir?: string | null
}

interface BoardRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  opened_at: number
  pinned: number
  deleted_at: number | null
}

const BACKUP_THROTTLE_MS = 30_000
const DAY = 24 * 60 * 60 * 1000
const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/
const ASSET_REF_PREFIX = 'asset:'
const BOARD_COLUMNS = 'id, title, created_at, updated_at, opened_at, pinned, deleted_at'
/** Folder (inside the library root) the 0.2-0.6 files are moved to after they were copied into SQLite. */
export const LEGACY_FOLDER = 'legacy-0.6'

/**
 * Schema migrations, applied in order inside one transaction each. `PRAGMA user_version` holds how many
 * have run. Never edit a shipped step: append a new one instead.
 */
const SCHEMA: ((db: DatabaseSync) => void)[] = [
  // 1: initial schema (0.7).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        ord INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS assets (
        hash TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        bytes BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        opened_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER,
        data TEXT NOT NULL,
        thumb BLOB
      );
      CREATE TABLE IF NOT EXISTS board_tags (
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (board_id, tag_id)
      );
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        data TEXT NOT NULL,
        thumb BLOB
      );
    `)
    // The .inkboard file a board was imported from (and its mtime then): opening the same, unchanged
    // file again opens that board instead of importing a duplicate.
    const cols = new Set((db.prepare('PRAGMA table_info(boards)').all() as { name: string }[]).map((c) => c.name))
    if (!cols.has('source_path')) db.exec('ALTER TABLE boards ADD COLUMN source_path TEXT')
    if (!cols.has('source_mtime')) db.exec('ALTER TABLE boards ADD COLUMN source_mtime INTEGER')
    db.exec('CREATE INDEX IF NOT EXISTS boards_source ON boards(source_path)')
  }
]

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

/**
 * The board library backed by Node's built-in SQLite (`library.sqlite`).
 *
 * Vector board JSON is stored uncompressed in `boards.data` and `templates.data`.
 * Raster images are decoded out of base64 and stored once by SHA-256 hash as raw binary BLOBs in `assets`.
 * Thumbnails are stored as raw binary WebP BLOBs.
 * Standalone `.inkboard` files are written or imported only on explicit user request.
 */
export class Library {
  private root: string
  private db!: DatabaseSync
  private lastBackup = new Map<string, number>()

  constructor(root: string) {
    this.root = root
  }

  private dbPath(): string {
    return join(this.root, 'library.sqlite')
  }

  // ------------------------------------------------------------------ lifecycle

  async init(legacyRecovery?: { bytes: string; meta: string }): Promise<void> {
    await mkdir(this.root, { recursive: true })

    this.db = new DatabaseSync(this.dbPath())
    // FULL: a committed save survives a power cut (NORMAL in WAL mode may lose the last commits).
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
    `)
    try {
      this.migrateSchema()
    } catch (err) {
      this.close()
      throw err
    }

    await this.migrateLegacyLibrary()
    if (legacyRecovery) await this.migrateLegacyRecovery(legacyRecovery.bytes, legacyRecovery.meta)
    await this.purgeExpired()
    this.gcAssets()
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      // already closed
    }
  }

  private migrateSchema(): void {
    const current = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (current > SCHEMA.length) {
      throw new Error('This library was made by a newer version of Inkboard. Please update Inkboard.')
    }
    for (let v = current; v < SCHEMA.length; v++) {
      this.tx(() => {
        SCHEMA[v](this.db)
        this.db.exec(`PRAGMA user_version = ${v + 1}`)
      })
    }
  }

  /** Run `fn` in one transaction: all of its writes land together or not at all. */
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  private async txAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const r = await fn()
      this.db.exec('COMMIT')
      return r
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  // ------------------------------------------------------------------ binary asset extraction

  /**
   * Unpacks a board buffer (plain JSON or legacy gzip), extracts any `data:<mime>;base64,...` images
   * into the binary `assets` table by SHA-256 hash, and returns clean JSON without base64 strings.
   * Call inside a transaction together with the write of the returned JSON.
   */
  private storeBoardAssets(bytes: Uint8Array | Buffer): string {
    const doc = parseBoardBuffer(bytes)
    const assets = doc.assets as Record<string, string> | undefined
    if (assets && typeof assets === 'object') {
      const insertAsset = this.db.prepare('INSERT INTO assets (hash, mime, bytes) VALUES (?, ?, ?) ON CONFLICT(hash) DO NOTHING')
      for (const [key, val] of Object.entries(assets)) {
        if (typeof val !== 'string') continue
        const m = DATA_URL_RE.exec(val)
        if (!m) continue
        const bin = Buffer.from(m[2], 'base64')
        const hash = createHash('sha256').update(bin).digest('hex')
        insertAsset.run(hash, m[1], bin)
        assets[key] = `${ASSET_REF_PREFIX}${hash}`
      }
    }
    return JSON.stringify(doc)
  }

  /** Rehydrates `asset:<sha256>` references from the `assets` table into a standalone JSON buffer. */
  private hydrateBoardData(dataJson: string): Uint8Array {
    const doc = JSON.parse(dataJson) as Record<string, unknown>
    const assets = doc.assets as Record<string, string> | undefined
    if (assets && typeof assets === 'object') {
      const selectAsset = this.db.prepare('SELECT mime, bytes FROM assets WHERE hash = ?')
      for (const [key, val] of Object.entries(assets)) {
        if (typeof val !== 'string' || !val.startsWith(ASSET_REF_PREFIX)) continue
        const row = selectAsset.get(val.slice(ASSET_REF_PREFIX.length)) as { mime: string; bytes: Uint8Array } | undefined
        if (!row) continue
        const b64 = Buffer.from(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength).toString('base64')
        assets[key] = `data:${row.mime};base64,${b64}`
      }
    }
    return new Uint8Array(Buffer.from(JSON.stringify(doc), 'utf8'))
  }

  /** Removes binary assets that are no longer referenced by any board or template. */
  private gcAssets(): void {
    const used = new Set<string>()
    const collect = (dataJson: string): void => {
      try {
        const doc = JSON.parse(dataJson) as { assets?: Record<string, string> }
        for (const val of Object.values(doc.assets ?? {})) {
          if (typeof val === 'string' && val.startsWith(ASSET_REF_PREFIX)) used.add(val.slice(ASSET_REF_PREFIX.length))
        }
      } catch {
        // ignore malformed row
      }
    }
    for (const r of this.db.prepare('SELECT data FROM boards').all() as { data: string }[]) collect(r.data)
    for (const r of this.db.prepare('SELECT data FROM templates').all() as { data: string }[]) collect(r.data)

    const all = this.db.prepare('SELECT hash FROM assets').all() as { hash: string }[]
    const del = this.db.prepare('DELETE FROM assets WHERE hash = ?')
    this.tx(() => {
      for (const { hash } of all) if (!used.has(hash)) del.run(hash)
    })
  }

  // ------------------------------------------------------------------ one-time migrations

  /**
   * Copies the 0.2-0.6 file library (`index.json`, `boards/*.inkboard`, `thumbs/*.webp`,
   * `templates/*.inkboard`) into `library.sqlite` in one transaction, then moves the old files into
   * `legacy-0.6/`. Nothing is deleted: if a board can't be read, its file is still kept there.
   * Re-running after a crash is safe: rows that already exist are never overwritten.
   */
  private async migrateLegacyLibrary(): Promise<void> {
    const indexPath = join(this.root, 'index.json')
    const boardsDir = join(this.root, 'boards')
    const thumbsDir = join(this.root, 'thumbs')
    const templatesDir = join(this.root, 'templates')

    let legacyIndex: LegacyIndexFile | null = null
    try {
      const buf = await readDurable(indexPath, (b) => {
        try {
          return JSON.parse(b.toString('utf8')).version === 1
        } catch {
          return false
        }
      })
      legacyIndex = JSON.parse(buf.toString('utf8')) as LegacyIndexFile
    } catch {
      // No readable index.json; still check if orphaned .inkboard files exist in boards/.
    }

    let orphanFiles: string[] = []
    try {
      orphanFiles = (await readdir(boardsDir)).filter((n) => n.endsWith('.inkboard'))
    } catch {
      // No boards/ directory.
    }

    const leftovers = [indexPath, `${indexPath}.bak`, boardsDir, thumbsDir, templatesDir]
    if (!legacyIndex && orphanFiles.length === 0) {
      // Nothing to copy, but a crash after the copy may have left part of the old files behind.
      if (await this.hasMeta('legacyMigratedAt')) await this.moveToLegacyFolder(leftovers)
      return
    }

    const readThumbFile = async (p: string): Promise<Uint8Array | null> => {
      try {
        return new Uint8Array(await readFile(p))
      } catch {
        return null
      }
    }
    const fileMtime = async (p: string): Promise<number | null> => {
      try {
        return Math.round((await stat(p)).mtimeMs)
      } catch {
        return null
      }
    }

    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (id, name, color, ord) VALUES (?, ?, ?, ?)')
    const insertBoard = this.db.prepare(`
      INSERT OR IGNORE INTO boards
        (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb, source_path, source_mtime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertBoardTag = this.db.prepare('INSERT OR IGNORE INTO board_tags (board_id, tag_id) VALUES (?, ?)')
    const insertTemplate = this.db.prepare(
      'INSERT OR IGNORE INTO templates (id, name, created_at, updated_at, data, thumb) VALUES (?, ?, ?, ?, ?, ?)'
    )

    const failed: string[] = []
    await this.txAsync(async () => {
      const migrated = new Set<string>()
      if (legacyIndex) {
        const validTagIds = new Set<string>()
        ;(legacyIndex.tags ?? []).forEach((t, idx) => {
          insertTag.run(t.id, t.name, t.color, idx)
          validTagIds.add(t.id)
        })

        for (const b of legacyIndex.boards ?? []) {
          // Same order 0.6 loaded in: the user's own file first, then the copy in boards/.
          let bytes: Buffer | null = null
          const linked = b.kind === 'file' && b.filePath ? b.filePath : null
          if (linked) bytes = await readDurable(linked, isValidBoard).catch(() => null)
          bytes ??= await readDurable(join(boardsDir, `${b.id}.inkboard`), isValidBoard).catch(() => null)
          if (!bytes) {
            failed.push(b.title || b.id)
            continue
          }
          try {
            const now = Date.now()
            insertBoard.run(
              b.id,
              b.title || 'Board',
              b.createdAt || now,
              b.updatedAt || now,
              b.openedAt || now,
              b.pinned ? 1 : 0,
              b.deletedAt ?? null,
              this.storeBoardAssets(bytes),
              await readThumbFile(join(thumbsDir, `${b.id}.webp`)),
              linked ? resolve(linked) : null,
              linked ? await fileMtime(linked) : null
            )
            for (const tagId of b.tagIds ?? []) if (validTagIds.has(tagId)) insertBoardTag.run(b.id, tagId)
            migrated.add(b.id)
          } catch (err) {
            console.error('Failed to migrate board', b.id, err)
            failed.push(b.title || b.id)
          }
        }

        for (const t of legacyIndex.templates ?? []) {
          try {
            const bytes = await readDurable(join(templatesDir, `${t.id}.inkboard`), isValidBoard)
            const thumb = await readThumbFile(join(templatesDir, `${t.id}.webp`))
            insertTemplate.run(t.id, t.name || 'Template', t.createdAt || Date.now(), t.updatedAt ?? null, this.storeBoardAssets(bytes), thumb)
          } catch (err) {
            console.error('Failed to migrate template', t.id, err)
            failed.push(t.name || t.id)
          }
        }

        if (legacyIndex.lastOpenedId && migrated.has(legacyIndex.lastOpenedId) && !(await this.hasMeta('lastOpenedId'))) {
          this.setMeta('lastOpenedId', legacyIndex.lastOpenedId)
        }
        if (legacyIndex.backupDir && !(await this.hasMeta('backupDir'))) this.setMeta('backupDir', legacyIndex.backupDir)
      }

      // Board files in boards/ that index.json did not list.
      for (const file of orphanFiles) {
        const id = basename(file, '.inkboard')
        if (migrated.has(id)) continue
        try {
          const bytes = await readDurable(join(boardsDir, file), isValidBoard)
          const thumb = await readThumbFile(join(thumbsDir, `${id}.webp`))
          const now = Date.now()
          insertBoard.run(id, 'Board', now, now, now, 0, null, this.storeBoardAssets(bytes), thumb, null, null)
        } catch {
          failed.push(file)
        }
      }

      this.setMeta('legacyMigratedAt', String(Date.now()))
    })

    if (failed.length) console.error(`Could not migrate (kept in ${LEGACY_FOLDER}/):`, failed.join(', '))
    await this.moveToLegacyFolder(leftovers)
  }

  /** Move the old library files out of the way (never delete them) once SQLite holds their contents. */
  private async moveToLegacyFolder(paths: string[]): Promise<void> {
    const dest = join(this.root, LEGACY_FOLDER)
    await mkdir(dest, { recursive: true })
    for (const p of paths) {
      if (!(await exists(p))) continue
      let target = join(dest, basename(p))
      if (await exists(target)) target = join(dest, `${basename(p)}-${Date.now()}`)
      try {
        await rename(p, target)
      } catch (err) {
        console.error('Could not move', p, 'to', dest, err)
      }
    }
  }

  /** 0.1 kept one autosave slot (recovery.inkboard + recovery.json). Turn it into a library entry. */
  private async migrateLegacyRecovery(bytesPath: string, metaPath: string): Promise<void> {
    try {
      const bytes = await readFile(bytesPath)
      if (!isValidBoard(bytes)) return
      let meta: { filePath?: string | null; fileName?: string | null } = {}
      try {
        meta = JSON.parse(await readFile(metaPath, 'utf8'))
      } catch {
        // no meta
      }
      const title = meta.fileName ? meta.fileName.replace(/\.inkboard$/i, '') : 'Board'
      await this.create(title, new Uint8Array(bytes))
      await rm(bytesPath, { force: true })
      await rm(metaPath, { force: true })
    } catch {
      // no 0.1 recovery file present
    }
  }

  private async purgeExpired(): Promise<void> {
    const limit = Date.now() - TRASH_DAYS * DAY
    const expired = this.db.prepare('SELECT id FROM boards WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(limit) as { id: string }[]
    if (!expired.length) return
    this.tx(() => {
      for (const b of expired) this.deleteBoardRow(b.id)
    })
  }

  // ------------------------------------------------------------------ internal helpers

  private getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string | null } | undefined
    return row?.value ?? null
  }

  private async hasMeta(key: string): Promise<boolean> {
    return this.getMeta(key) !== null
  }

  private setMeta(key: string, value: string | null): void {
    if (value === null) {
      this.db.prepare('DELETE FROM meta WHERE key = ?').run(key)
    } else {
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    }
  }

  private rowToEntry(row: BoardRow, tagIds: string[]): BoardEntry {
    const entry: BoardEntry = {
      id: row.id,
      title: row.title,
      kind: 'draft',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      openedAt: row.opened_at,
      tagIds
    }
    if (row.pinned) entry.pinned = true
    if (row.deleted_at !== null) entry.deletedAt = row.deleted_at
    return entry
  }

  private getEntry(id: string): BoardEntry {
    const row = this.db.prepare(`SELECT ${BOARD_COLUMNS} FROM boards WHERE id = ?`).get(id) as BoardRow | undefined
    if (!row) throw new Error(`Unknown board ${id}`)
    const tags = this.db.prepare('SELECT tag_id FROM board_tags WHERE board_id = ?').all(id) as { tag_id: string }[]
    return this.rowToEntry(
      row,
      tags.map((t) => t.tag_id)
    )
  }

  private insertBoard(title: string, dataJson: string, thumb: Uint8Array | null, source: { path: string; mtime: number } | null, created?: number, updated?: number): string {
    const now = Date.now()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO boards (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb, source_path, source_mtime)
         VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`
      )
      .run(id, title, created ?? now, updated ?? now, now, dataJson, thumb, source?.path ?? null, source?.mtime ?? null)
    this.setMeta('lastOpenedId', id)
    return id
  }

  private deleteBoardRow(id: string): void {
    this.db.prepare('DELETE FROM boards WHERE id = ?').run(id)
    if (this.getMeta('lastOpenedId') === id) this.setMeta('lastOpenedId', null)
  }

  // ------------------------------------------------------------------ queries

  async list(): Promise<LibraryState> {
    const rows = this.db.prepare(`SELECT ${BOARD_COLUMNS} FROM boards ORDER BY created_at ASC`).all() as unknown as BoardRow[]
    const tagsByBoard = new Map<string, string[]>()
    for (const r of this.db.prepare('SELECT board_id, tag_id FROM board_tags').all() as { board_id: string; tag_id: string }[]) {
      const list = tagsByBoard.get(r.board_id)
      if (list) list.push(r.tag_id)
      else tagsByBoard.set(r.board_id, [r.tag_id])
    }
    const boards = rows.map((r) => this.rowToEntry(r, tagsByBoard.get(r.id) ?? []))
    const tags = (this.db.prepare('SELECT id, name, color FROM tags ORDER BY ord ASC, rowid ASC').all() as unknown as Tag[]).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color
    }))
    const tplRows = this.db.prepare('SELECT id, name, created_at, updated_at FROM templates ORDER BY created_at ASC').all() as {
      id: string
      name: string
      created_at: number
      updated_at: number | null
    }[]
    const templates: TemplateEntry[] = tplRows.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      ...(t.updated_at !== null ? { updatedAt: t.updated_at } : {})
    }))
    return { boards, tags, templates, lastOpenedId: this.getMeta('lastOpenedId'), backupDir: this.getMeta('backupDir') }
  }

  async thumb(id: string): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT thumb FROM boards WHERE id = ?').get(id) as { thumb: Uint8Array | null } | undefined
    return row?.thumb ? new Uint8Array(row.thumb) : null
  }

  // ------------------------------------------------------------------ board contents

  async create(title: string, bytes: Uint8Array): Promise<BoardEntry> {
    const id = this.tx(() => this.insertBoard(title.trim() || 'Board', this.storeBoardAssets(bytes), null, null))
    return this.getEntry(id)
  }

  async load(id: string): Promise<Uint8Array> {
    const row = this.db.prepare('SELECT data FROM boards WHERE id = ?').get(id) as { data: string } | undefined
    if (!row) throw new Error(`Unknown board ${id}`)
    return this.hydrateBoardData(row.data)
  }

  async save(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<{ ok: boolean; updatedAt: number }> {
    const b = this.getEntry(id)
    const updatedAt = Date.now()
    this.tx(() => {
      const dataJson = this.storeBoardAssets(bytes)
      if (thumb) this.db.prepare('UPDATE boards SET data = ?, thumb = ?, updated_at = ? WHERE id = ?').run(dataJson, thumb, updatedAt, id)
      else this.db.prepare('UPDATE boards SET data = ?, updated_at = ? WHERE id = ?').run(dataJson, updatedAt, id)
    })
    // `bytes` already is a standalone board file (images inline), so the mirror needs no rehydration.
    void this.mirrorToBackup({ ...b, updatedAt }, bytes)
    return { ok: true, updatedAt }
  }

  async setLastOpened(id: string): Promise<void> {
    this.getEntry(id)
    this.db.prepare('UPDATE boards SET opened_at = ? WHERE id = ?').run(Date.now(), id)
    this.setMeta('lastOpenedId', id)
  }

  // ------------------------------------------------------------------ entry management

  async rename(id: string, title: string): Promise<BoardEntry> {
    const b = this.getEntry(id)
    const clean = title.trim() || b.title
    await this.removeBackupMirror(b)
    this.db.prepare('UPDATE boards SET title = ? WHERE id = ?').run(clean, id)
    return this.getEntry(id)
  }

  async duplicate(id: string): Promise<BoardEntry> {
    const src = this.db.prepare('SELECT title, data, thumb FROM boards WHERE id = ?').get(id) as
      | { title: string; data: string; thumb: Uint8Array | null }
      | undefined
    if (!src) throw new Error(`Unknown board ${id}`)
    const copyId = this.tx(() => {
      const copy = this.insertBoard(`${src.title} (copy)`, src.data, src.thumb, null)
      this.db.prepare('INSERT INTO board_tags (board_id, tag_id) SELECT ?, tag_id FROM board_tags WHERE board_id = ?').run(copy, id)
      return copy
    })
    return this.getEntry(copyId)
  }

  async pin(id: string, on: boolean): Promise<void> {
    this.getEntry(id)
    this.db.prepare('UPDATE boards SET pinned = ? WHERE id = ?').run(on ? 1 : 0, id)
  }

  async setTags(id: string, tagIds: string[]): Promise<void> {
    this.getEntry(id)
    const validIds = new Set((this.db.prepare('SELECT id FROM tags').all() as { id: string }[]).map((x) => x.id))
    this.tx(() => {
      this.db.prepare('DELETE FROM board_tags WHERE board_id = ?').run(id)
      const ins = this.db.prepare('INSERT OR IGNORE INTO board_tags (board_id, tag_id) VALUES (?, ?)')
      for (const t of tagIds) if (validIds.has(t)) ins.run(id, t)
    })
  }

  async createTag(name: string, color: string): Promise<Tag> {
    const tag: Tag = { id: randomUUID(), name: name.trim() || 'Tag', color }
    this.db
      .prepare('INSERT INTO tags (id, name, color, ord) VALUES (?, ?, ?, (SELECT COALESCE(MAX(ord), -1) + 1 FROM tags))')
      .run(tag.id, tag.name, tag.color)
    return tag
  }

  async updateTag(id: string, patch: Partial<Omit<Tag, 'id'>>): Promise<void> {
    this.db
      .prepare('UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
      .run(patch.name ?? null, patch.color ?? null, id)
  }

  async deleteTag(id: string): Promise<void> {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  }

  /** Move to "Recently deleted". */
  async remove(id: string): Promise<void> {
    this.getEntry(id)
    this.db.prepare('UPDATE boards SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
    if (this.getMeta('lastOpenedId') === id) this.setMeta('lastOpenedId', null)
  }

  async restore(id: string): Promise<void> {
    this.getEntry(id)
    this.db.prepare('UPDATE boards SET deleted_at = NULL WHERE id = ?').run(id)
  }

  /** Delete forever from the database and garbage-collect unreferenced binary assets. */
  async purge(id: string): Promise<void> {
    this.tx(() => this.deleteBoardRow(id))
    this.gcAssets()
  }

  // ------------------------------------------------------------------ explicit file export / import

  /**
   * Export a board to a standalone `.inkboard` file. The board stays in the library; opening this
   * file again (unchanged) opens the board instead of importing a copy.
   */
  async saveAsFile(id: string, path: string, bytes: Uint8Array): Promise<BoardEntry> {
    this.getEntry(id)
    await writeDurable(path, bytes)
    const mtime = Math.round((await stat(path)).mtimeMs)
    this.db.prepare('UPDATE boards SET source_path = ?, source_mtime = ? WHERE id = ?').run(resolve(path), mtime, id)
    return this.getEntry(id)
  }

  /**
   * Open a `.inkboard` file (plain JSON or legacy gzip). If this exact file, unchanged since, was already
   * imported or exported, that board is returned (and taken out of "Recently deleted"); otherwise the
   * file is imported as a new board.
   */
  async importFile(path: string): Promise<BoardEntry> {
    const full = resolve(path)
    const st = await stat(full)
    const mtime = Math.round(st.mtimeMs)
    const known = this.db
      .prepare('SELECT id FROM boards WHERE source_path = ? AND source_mtime = ? ORDER BY deleted_at IS NOT NULL, opened_at DESC LIMIT 1')
      .get(full, mtime) as { id: string } | undefined
    if (known) {
      this.db.prepare('UPDATE boards SET deleted_at = NULL WHERE id = ?').run(known.id)
      await this.setLastOpened(known.id)
      return this.getEntry(known.id)
    }
    const buf = await readDurable(full, isValidBoard)
    const now = Date.now()
    const title = basename(full, extname(full)) || 'Board'
    const id = this.tx(() =>
      this.insertBoard(title, this.storeBoardAssets(buf), null, { path: full, mtime }, Math.round(st.birthtimeMs || now), mtime || now)
    )
    return this.getEntry(id)
  }

  // ------------------------------------------------------------------ templates

  async saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry> {
    const entry: TemplateEntry = { id: randomUUID(), name: name.trim() || 'Template', createdAt: Date.now() }
    this.tx(() => {
      this.db
        .prepare('INSERT INTO templates (id, name, created_at, updated_at, data, thumb) VALUES (?, ?, ?, NULL, ?, ?)')
        .run(entry.id, entry.name, entry.createdAt, this.storeBoardAssets(bytes), thumb)
    })
    return entry
  }

  async replaceTemplate(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry | null> {
    const row = this.db.prepare('SELECT id, name, created_at FROM templates WHERE id = ?').get(id) as
      | { id: string; name: string; created_at: number }
      | undefined
    if (!row) return null
    const updatedAt = Date.now()
    this.tx(() => {
      const dataJson = this.storeBoardAssets(bytes)
      if (thumb) this.db.prepare('UPDATE templates SET data = ?, thumb = ?, updated_at = ? WHERE id = ?').run(dataJson, thumb, updatedAt, id)
      else this.db.prepare('UPDATE templates SET data = ?, updated_at = ? WHERE id = ?').run(dataJson, updatedAt, id)
    })
    this.gcAssets()
    return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt }
  }

  async loadTemplate(id: string): Promise<Uint8Array> {
    const row = this.db.prepare('SELECT data FROM templates WHERE id = ?').get(id) as { data: string } | undefined
    if (!row) throw new Error(`Unknown template ${id}`)
    return this.hydrateBoardData(row.data)
  }

  async templateThumb(id: string): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT thumb FROM templates WHERE id = ?').get(id) as { thumb: Uint8Array | null } | undefined
    return row?.thumb ? new Uint8Array(row.thumb) : null
  }

  async renameTemplate(id: string, name: string): Promise<void> {
    if (!name.trim()) return
    this.db.prepare('UPDATE templates SET name = ? WHERE id = ?').run(name.trim(), id)
  }

  async deleteTemplate(id: string): Promise<void> {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
    this.gcAssets()
  }

  // ------------------------------------------------------------------ backup mirror

  get backupDir(): string | null {
    return this.getMeta('backupDir')
  }

  async setBackupDir(dir: string | null): Promise<void> {
    this.setMeta('backupDir', dir)
    this.lastBackup.clear()
    if (!dir) return
    const state = await this.list()
    for (const b of state.boards) {
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
    const dir = this.backupDir
    if (!dir) return
    const last = this.lastBackup.get(b.id) ?? 0
    if (!force && Date.now() - last < BACKUP_THROTTLE_MS) return
    this.lastBackup.set(b.id, Date.now())
    try {
      await writeDurable(join(dir, this.backupName(b)), bytes)
    } catch (err) {
      console.error('Backup mirror failed', err)
    }
  }

  private async removeBackupMirror(b: BoardEntry): Promise<void> {
    const dir = this.backupDir
    if (!dir) return
    await removeWithBackup(join(dir, this.backupName(b))).catch(() => {})
    this.lastBackup.delete(b.id)
  }
}
