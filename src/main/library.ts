import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  TRASH_DAYS,
  type BoardEntry,
  type LibraryState,
  type Tag,
  type TemplateEntry
} from '../shared/library'
import { isValidBoard, parseBoardBuffer, readDurable, removeWithBackup, safeFileName, writeDurable } from './fsutil'

interface LegacyIndexFile extends LibraryState {
  version: 1
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
    // Version history was removed in 0.7: drop the snapshots older versions kept.
    await rm(join(this.root, 'history'), { recursive: true, force: true }).catch(() => {})

    this.db = new DatabaseSync(this.dbPath())
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

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

    await this.migrateLegacyLibrary()
    if (legacyRecovery) await this.migrateLegacyRecovery(legacyRecovery.bytes, legacyRecovery.meta)
    await this.purgeExpired()
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      // already closed
    }
  }

  // ------------------------------------------------------------------ binary asset extraction

  /**
   * Unpacks a board buffer (plain JSON or legacy gzip), extracts any `data:<mime>;base64,...` images
   * into the binary `assets` table by SHA-256 hash, and returns clean JSON without base64 strings.
   */
  private storeBoardAssets(bytes: Uint8Array | Buffer): string {
    const doc = parseBoardBuffer(bytes)
    const assets = doc.assets as Record<string, string> | undefined
    if (assets && typeof assets === 'object') {
      const insertAsset = this.db.prepare(
        'INSERT INTO assets (hash, mime, bytes) VALUES (?, ?, ?) ON CONFLICT(hash) DO NOTHING'
      )
      for (const [key, val] of Object.entries(assets)) {
        if (typeof val !== 'string') continue
        const m = DATA_URL_RE.exec(val)
        if (!m) continue
        const mime = m[1]
        const bin = Buffer.from(m[2], 'base64')
        const hash = createHash('sha256').update(bin).digest('hex')
        insertAsset.run(hash, mime, bin)
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
        const hash = val.slice(ASSET_REF_PREFIX.length)
        const row = selectAsset.get(hash) as { mime: string; bytes: Uint8Array } | undefined
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
        if (!doc.assets) return
        for (const val of Object.values(doc.assets)) {
          if (typeof val === 'string' && val.startsWith(ASSET_REF_PREFIX)) {
            used.add(val.slice(ASSET_REF_PREFIX.length))
          }
        }
      } catch {
        // ignore malformed row
      }
    }
    for (const r of this.db.prepare('SELECT data FROM boards').all() as { data: string }[]) collect(r.data)
    for (const r of this.db.prepare('SELECT data FROM templates').all() as { data: string }[]) collect(r.data)

    const all = this.db.prepare('SELECT hash FROM assets').all() as { hash: string }[]
    const del = this.db.prepare('DELETE FROM assets WHERE hash = ?')
    for (const { hash } of all) {
      if (!used.has(hash)) del.run(hash)
    }
  }

  // ------------------------------------------------------------------ one-time migrations

  /**
   * Migrates the 0.2-0.6 file/gzip library (`index.json`, `boards/*.inkboard`, `thumbs/*.webp`,
   * `templates/*.inkboard`) into `library.sqlite`, then deletes the old archive folders.
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
      const names = await readdir(boardsDir)
      orphanFiles = names.filter((n) => n.endsWith('.inkboard') && !n.endsWith('.tmp'))
    } catch {
      // No boards/ directory.
    }

    if (!legacyIndex && orphanFiles.length === 0) return

    const migratedBoardIds = new Set<string>()
    const readThumbFile = async (p: string): Promise<Uint8Array | null> => {
      try {
        return new Uint8Array(await readFile(p))
      } catch {
        return null
      }
    }

    const insertTag = this.db.prepare(
      'INSERT OR REPLACE INTO tags (id, name, color, ord) VALUES (?, ?, ?, ?)'
    )
    const insertBoard = this.db.prepare(`
      INSERT OR REPLACE INTO boards (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertBoardTag = this.db.prepare(
      'INSERT OR IGNORE INTO board_tags (board_id, tag_id) VALUES (?, ?)'
    )
    const insertTemplate = this.db.prepare(`
      INSERT OR REPLACE INTO templates (id, name, created_at, updated_at, data, thumb)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    if (legacyIndex) {
      const validTagIds = new Set<string>()
      ;(legacyIndex.tags ?? []).forEach((t, idx) => {
        insertTag.run(t.id, t.name, t.color, idx)
        validTagIds.add(t.id)
      })

      for (const b of legacyIndex.boards ?? []) {
        let bytes: Buffer | null = null
        if (b.kind === 'file' && b.filePath) {
          try {
            bytes = await readDurable(b.filePath, isValidBoard)
          } catch {
            // Fall back to internal copy if the external file was moved.
          }
        }
        if (!bytes) {
          try {
            bytes = await readDurable(join(boardsDir, `${b.id}.inkboard`), isValidBoard)
          } catch {
            // Unreadable board; skip without aborting the rest of the migration.
          }
        }
        if (!bytes) continue

        try {
          const dataJson = this.storeBoardAssets(bytes)
          const thumb = await readThumbFile(join(thumbsDir, `${b.id}.webp`))
          insertBoard.run(
            b.id,
            b.title || 'Board',
            b.createdAt || Date.now(),
            b.updatedAt || Date.now(),
            b.openedAt || Date.now(),
            b.pinned ? 1 : 0,
            b.deletedAt ?? null,
            dataJson,
            thumb
          )
          for (const tagId of b.tagIds ?? []) {
            if (validTagIds.has(tagId)) insertBoardTag.run(b.id, tagId)
          }
          migratedBoardIds.add(b.id)
        } catch (err) {
          console.error('Failed to migrate board', b.id, err)
        }
      }

      for (const t of legacyIndex.templates ?? []) {
        try {
          const bytes = await readDurable(join(templatesDir, `${t.id}.inkboard`), isValidBoard)
          const dataJson = this.storeBoardAssets(bytes)
          const thumb = await readThumbFile(join(templatesDir, `${t.id}.webp`))
          insertTemplate.run(t.id, t.name || 'Template', t.createdAt || Date.now(), t.updatedAt ?? null, dataJson, thumb)
        } catch (err) {
          console.error('Failed to migrate template', t.id, err)
        }
      }

      if (legacyIndex.lastOpenedId && migratedBoardIds.has(legacyIndex.lastOpenedId)) {
        this.setMeta('lastOpenedId', legacyIndex.lastOpenedId)
      }
      if (legacyIndex.backupDir) {
        this.setMeta('backupDir', legacyIndex.backupDir)
      }
    }

    // Rescue any board files in boards/ that were not in index.json.
    for (const file of orphanFiles) {
      const id = basename(file, '.inkboard')
      if (migratedBoardIds.has(id)) continue
      try {
        const bytes = await readDurable(join(boardsDir, file), isValidBoard)
        const dataJson = this.storeBoardAssets(bytes)
        const thumb = await readThumbFile(join(thumbsDir, `${id}.webp`))
        const now = Date.now()
        insertBoard.run(id, 'Board', now, now, now, 0, null, dataJson, thumb)
        migratedBoardIds.add(id)
      } catch {
        // ignore unreadable orphan
      }
    }

    // Clean up legacy file-based storage once migrated into SQLite.
    await removeWithBackup(indexPath)
    await rm(boardsDir, { recursive: true, force: true }).catch(() => {})
    await rm(thumbsDir, { recursive: true, force: true }).catch(() => {})
    await rm(templatesDir, { recursive: true, force: true }).catch(() => {})
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
    const expired = this.db
      .prepare('SELECT id FROM boards WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(limit) as { id: string }[]
    for (const b of expired) await this.purge(b.id)
  }

  // ------------------------------------------------------------------ internal helpers

  private getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string | null } | undefined
    return row?.value ?? null
  }

  private setMeta(key: string, value: string | null): void {
    if (value === null) {
      this.db.prepare('DELETE FROM meta WHERE key = ?').run(key)
    } else {
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    }
  }

  private rowToEntry(row: BoardRow): BoardEntry {
    const tagRows = this.db
      .prepare('SELECT tag_id FROM board_tags WHERE board_id = ?')
      .all(row.id) as { tag_id: string }[]
    const entry: BoardEntry = {
      id: row.id,
      title: row.title,
      kind: 'draft',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      openedAt: row.opened_at,
      tagIds: tagRows.map((t) => t.tag_id)
    }
    if (row.pinned) entry.pinned = true
    if (row.deleted_at !== null) entry.deletedAt = row.deleted_at
    return entry
  }

  private getEntry(id: string): BoardEntry {
    const row = this.db
      .prepare('SELECT id, title, created_at, updated_at, opened_at, pinned, deleted_at FROM boards WHERE id = ?')
      .get(id) as BoardRow | undefined
    if (!row) throw new Error(`Unknown board ${id}`)
    return this.rowToEntry(row)
  }

  // ------------------------------------------------------------------ queries

  async list(): Promise<LibraryState> {
    const rows = this.db
      .prepare('SELECT id, title, created_at, updated_at, opened_at, pinned, deleted_at FROM boards ORDER BY created_at ASC')
      .all() as unknown as BoardRow[]
    const boards = rows.map((r) => this.rowToEntry(r))
    const tags = (this.db.prepare('SELECT id, name, color FROM tags ORDER BY ord ASC, rowid ASC').all() as unknown as Tag[]).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color
    }))
    const tplRows = this.db
      .prepare('SELECT id, name, created_at, updated_at FROM templates ORDER BY created_at ASC')
      .all() as { id: string; name: string; created_at: number; updated_at: number | null }[]
    const templates: TemplateEntry[] = tplRows.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      ...(t.updated_at !== null ? { updatedAt: t.updated_at } : {})
    }))
    return {
      boards,
      tags,
      templates,
      lastOpenedId: this.getMeta('lastOpenedId'),
      backupDir: this.getMeta('backupDir')
    }
  }

  async thumb(id: string): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT thumb FROM boards WHERE id = ?').get(id) as { thumb: Uint8Array | null } | undefined
    return row?.thumb ? new Uint8Array(row.thumb) : null
  }

  // ------------------------------------------------------------------ board contents

  async create(title: string, bytes: Uint8Array): Promise<BoardEntry> {
    const now = Date.now()
    const id = randomUUID()
    const cleanTitle = title.trim() || 'Board'
    const dataJson = this.storeBoardAssets(bytes)
    this.db
      .prepare(
        'INSERT INTO boards (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, NULL)'
      )
      .run(id, cleanTitle, now, now, now, dataJson)
    this.setMeta('lastOpenedId', id)
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
    const dataJson = this.storeBoardAssets(bytes)
    if (thumb) {
      this.db
        .prepare('UPDATE boards SET data = ?, thumb = ?, updated_at = ? WHERE id = ?')
        .run(dataJson, thumb, updatedAt, id)
    } else {
      this.db
        .prepare('UPDATE boards SET data = ?, updated_at = ? WHERE id = ?')
        .run(dataJson, updatedAt, id)
    }
    void this.mirrorToBackup({ ...b, updatedAt }, this.hydrateBoardData(dataJson))
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
    const src = this.db
      .prepare('SELECT title, data, thumb FROM boards WHERE id = ?')
      .get(id) as { title: string; data: string; thumb: Uint8Array | null } | undefined
    if (!src) throw new Error(`Unknown board ${id}`)
    const srcTags = this.db.prepare('SELECT tag_id FROM board_tags WHERE board_id = ?').all(id) as { tag_id: string }[]
    const now = Date.now()
    const copyId = randomUUID()
    this.db
      .prepare(
        'INSERT INTO boards (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)'
      )
      .run(copyId, `${src.title} (copy)`, now, now, now, src.data, src.thumb)
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO board_tags (board_id, tag_id) VALUES (?, ?)')
    for (const t of srcTags) insertTag.run(copyId, t.tag_id)
    this.setMeta('lastOpenedId', copyId)
    return this.getEntry(copyId)
  }

  async pin(id: string, on: boolean): Promise<void> {
    this.getEntry(id)
    this.db.prepare('UPDATE boards SET pinned = ? WHERE id = ?').run(on ? 1 : 0, id)
  }

  async setTags(id: string, tagIds: string[]): Promise<void> {
    this.getEntry(id)
    const validIds = new Set(
      (this.db.prepare('SELECT id FROM tags').all() as { id: string }[]).map((x) => x.id)
    )
    this.db.prepare('DELETE FROM board_tags WHERE board_id = ?').run(id)
    const ins = this.db.prepare('INSERT OR IGNORE INTO board_tags (board_id, tag_id) VALUES (?, ?)')
    for (const t of tagIds) {
      if (validIds.has(t)) ins.run(id, t)
    }
  }

  async createTag(name: string, color: string): Promise<Tag> {
    const tag: Tag = { id: randomUUID(), name: name.trim() || 'Tag', color }
    const maxOrd = (this.db.prepare('SELECT COALESCE(MAX(ord), -1) AS m FROM tags').get() as { m: number }).m
    this.db.prepare('INSERT INTO tags (id, name, color, ord) VALUES (?, ?, ?, ?)').run(tag.id, tag.name, tag.color, maxOrd + 1)
    return tag
  }

  async updateTag(id: string, patch: Partial<Omit<Tag, 'id'>>): Promise<void> {
    const cur = this.db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(id) as Tag | undefined
    if (!cur) return
    const name = patch.name !== undefined ? patch.name : cur.name
    const color = patch.color !== undefined ? patch.color : cur.color
    this.db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, id)
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
    this.db.prepare('DELETE FROM boards WHERE id = ?').run(id)
    if (this.getMeta('lastOpenedId') === id) this.setMeta('lastOpenedId', null)
    this.gcAssets()
  }

  // ------------------------------------------------------------------ explicit file export / import

  /** Export a board to a standalone `.inkboard` file on request; the board itself stays in SQLite. */
  async saveAsFile(id: string, path: string, bytes: Uint8Array): Promise<BoardEntry> {
    this.getEntry(id)
    const dataJson = this.storeBoardAssets(bytes)
    const now = Date.now()
    this.db.prepare('UPDATE boards SET data = ?, updated_at = ? WHERE id = ?').run(dataJson, now, id)
    await writeDurable(path, this.hydrateBoardData(dataJson))
    return this.getEntry(id)
  }

  /** Import a `.inkboard` file (new plain JSON or legacy gzip) into the SQLite database. */
  async importFile(path: string): Promise<BoardEntry> {
    const buf = await readDurable(path, isValidBoard)
    const st = await stat(path)
    const now = Date.now()
    const id = randomUUID()
    const title = basename(path, extname(path)) || 'Board'
    const dataJson = this.storeBoardAssets(buf)
    this.db
      .prepare(
        'INSERT INTO boards (id, title, created_at, updated_at, opened_at, pinned, deleted_at, data, thumb) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, NULL)'
      )
      .run(id, title, Math.round(st.birthtimeMs || now), Math.round(st.mtimeMs || now), now, dataJson)
    this.setMeta('lastOpenedId', id)
    return this.getEntry(id)
  }

  async locate(id: string, path: string): Promise<BoardEntry> {
    this.getEntry(id)
    const buf = await readDurable(path, isValidBoard)
    const dataJson = this.storeBoardAssets(buf)
    this.db.prepare('UPDATE boards SET data = ?, updated_at = ? WHERE id = ?').run(dataJson, Date.now(), id)
    return this.getEntry(id)
  }

  filePath(_id: string): string | undefined {
    return undefined
  }

  // ------------------------------------------------------------------ templates

  async saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry> {
    const entry: TemplateEntry = { id: randomUUID(), name: name.trim() || 'Template', createdAt: Date.now() }
    const dataJson = this.storeBoardAssets(bytes)
    this.db
      .prepare('INSERT INTO templates (id, name, created_at, updated_at, data, thumb) VALUES (?, ?, ?, NULL, ?, ?)')
      .run(entry.id, entry.name, entry.createdAt, dataJson, thumb)
    return entry
  }

  async replaceTemplate(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry | null> {
    const row = this.db
      .prepare('SELECT id, name, created_at FROM templates WHERE id = ?')
      .get(id) as { id: string; name: string; created_at: number } | undefined
    if (!row) return null
    const updatedAt = Date.now()
    const dataJson = this.storeBoardAssets(bytes)
    if (thumb) {
      this.db
        .prepare('UPDATE templates SET data = ?, thumb = ?, updated_at = ? WHERE id = ?')
        .run(dataJson, thumb, updatedAt, id)
    } else {
      this.db
        .prepare('UPDATE templates SET data = ?, updated_at = ? WHERE id = ?')
        .run(dataJson, updatedAt, id)
    }
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
