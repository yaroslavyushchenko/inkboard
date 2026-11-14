import { TRASH_DAYS, type BoardEntry, type LibraryState, type TemplateEntry } from '../../../shared/library'
import type { BoardStoreApi } from '../../../shared/platform'

/**
 * The board library in the browser: IndexedDB, the web counterpart of the SQLite library in the
 * Electron main process (src/main/library.ts), behind the same BoardStoreApi.
 *
 * - `state` holds the index (boards, tags, templates, last opened board) under one key.
 * - `boards`, `thumbs`, `templates`, `templateThumbs` hold the bytes, keyed by id.
 *
 * Every change runs in one readwrite transaction that also rewrites the index, so a board and its
 * entry are saved together or not at all, and two tabs never interleave their read-modify-write.
 */

const STORES = ['state', 'boards', 'thumbs', 'templates', 'templateThumbs'] as const
type StoreName = (typeof STORES)[number]

const DAY = 24 * 60 * 60 * 1000
const uid = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36)
const emptyIndex = (): LibraryState => ({ boards: [], tags: [], templates: [], lastOpenedId: null, backupDir: null })

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

export function openLibraryDb(name = 'inkboard'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () => {
      for (const store of STORES) if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store)
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

/** Runs `fn` in one transaction; resolves with its result once the transaction has committed. */
async function inTransaction<T>(db: IDBDatabase, mode: IDBTransactionMode, stores: StoreName[], fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const tx = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
  // When `fn` fails we abort and report its error; the abort itself is expected then.
  done.catch(() => {})
  try {
    const result = await fn(tx)
    await done
    return result
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // Already finished.
    }
    throw err
  }
}

async function readIndex(tx: IDBTransaction): Promise<LibraryState> {
  const idx = (await request(tx.objectStore('state').get('index'))) as LibraryState | undefined
  return idx ? { ...emptyIndex(), ...idx } : emptyIndex()
}

const writeIndex = (tx: IDBTransaction, idx: LibraryState): Promise<IDBValidKey> => request(tx.objectStore('state').put(idx, 'index'))

function boardIn(idx: LibraryState, id: string): BoardEntry {
  const b = idx.boards.find((x) => x.id === id)
  if (!b) throw new Error(`Unknown board ${id}`)
  return b
}

const bytesOf = (v: unknown): Uint8Array | null => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null)

export function createIndexedDbStore(dbName = 'inkboard'): BoardStoreApi {
  let opened: Promise<IDBDatabase> | null = null
  const db = (): Promise<IDBDatabase> => (opened ??= openLibraryDb(dbName).then(async (d) => (await purgeExpired(d), d)))

  /** A change to the index (and, in the same transaction, to any of `stores`). */
  const change = async <T>(stores: StoreName[], fn: (tx: IDBTransaction, idx: LibraryState) => T | Promise<T>): Promise<T> =>
    inTransaction(await db(), 'readwrite', ['state', ...stores], async (tx) => {
      const idx = await readIndex(tx)
      const result = await fn(tx, idx)
      await writeIndex(tx, idx)
      return result
    })

  const read = async (store: StoreName, id: string): Promise<Uint8Array | null> =>
    inTransaction(await db(), 'readonly', [store], async (tx) => bytesOf(await request(tx.objectStore(store).get(id))))

  /** Boards in "Recently deleted" for longer than TRASH_DAYS go for good, as on the desktop. */
  async function purgeExpired(d: IDBDatabase): Promise<void> {
    const limit = Date.now() - TRASH_DAYS * DAY
    await inTransaction(d, 'readwrite', ['state', 'boards', 'thumbs'], async (tx) => {
      const idx = await readIndex(tx)
      const expired = idx.boards.filter((b) => b.deletedAt !== undefined && b.deletedAt < limit)
      if (!expired.length) return
      for (const b of expired) {
        tx.objectStore('boards').delete(b.id)
        tx.objectStore('thumbs').delete(b.id)
      }
      idx.boards = idx.boards.filter((b) => !expired.includes(b))
      await writeIndex(tx, idx)
    })
  }

  const api: BoardStoreApi = {
    async list() {
      return inTransaction(await db(), 'readonly', ['state'], readIndex)
    },
    thumb: (id) => read('thumbs', id),
    create: (title, bytes) =>
      change(['boards'], (tx, idx) => {
        const now = Date.now()
        const entry: BoardEntry = { id: uid(), title, kind: 'draft', createdAt: now, updatedAt: now, openedAt: now, tagIds: [] }
        tx.objectStore('boards').put(bytes, entry.id)
        idx.boards.push(entry)
        idx.lastOpenedId = entry.id
        return { ...entry }
      }),
    async load(id) {
      const bytes = await read('boards', id)
      if (!bytes) throw new Error('Board data not found')
      return bytes
    },
    save: (id, bytes, thumb) =>
      change(['boards', 'thumbs'], (tx, idx) => {
        const b = boardIn(idx, id)
        tx.objectStore('boards').put(bytes, id)
        if (thumb) tx.objectStore('thumbs').put(thumb, id)
        b.updatedAt = Date.now()
        return { ok: true, updatedAt: b.updatedAt }
      }),
    setLastOpened: (id) =>
      change([], (_tx, idx) => {
        boardIn(idx, id).openedAt = Date.now()
        idx.lastOpenedId = id
      }),
    rename: (id, title) =>
      change([], (_tx, idx) => {
        const b = boardIn(idx, id)
        b.title = title.trim() || b.title
        return { ...b }
      }),
    duplicate: (id) =>
      change(['boards', 'thumbs'], async (tx, idx) => {
        const src = boardIn(idx, id)
        const bytes = bytesOf(await request(tx.objectStore('boards').get(id)))
        if (!bytes) throw new Error('Board data not found')
        const thumb = await request(tx.objectStore('thumbs').get(id))
        const now = Date.now()
        const copy: BoardEntry = { id: uid(), title: `${src.title} (copy)`, kind: 'draft', createdAt: now, updatedAt: now, openedAt: now, tagIds: [...src.tagIds] }
        tx.objectStore('boards').put(bytes, copy.id)
        if (thumb) tx.objectStore('thumbs').put(thumb, copy.id)
        idx.boards.push(copy)
        idx.lastOpenedId = copy.id
        return { ...copy }
      }),
    pin: (id, on) =>
      change([], (_tx, idx) => {
        const b = boardIn(idx, id)
        if (on) b.pinned = true
        else delete b.pinned
      }),
    setTags: (id, tagIds) =>
      change([], (_tx, idx) => {
        boardIn(idx, id).tagIds = [...tagIds]
      }),
    createTag: (name, color) =>
      change([], (_tx, idx) => {
        const tag = { id: uid(), name: name.trim() || 'Tag', color }
        idx.tags.push(tag)
        return { ...tag }
      }),
    updateTag: (id, patch) =>
      change([], (_tx, idx) => {
        const t = idx.tags.find((x) => x.id === id)
        if (t) Object.assign(t, patch)
      }),
    deleteTag: (id) =>
      change([], (_tx, idx) => {
        idx.tags = idx.tags.filter((t) => t.id !== id)
        for (const b of idx.boards) b.tagIds = b.tagIds.filter((t) => t !== id)
      }),
    remove: (id) =>
      change([], (_tx, idx) => {
        boardIn(idx, id).deletedAt = Date.now()
        if (idx.lastOpenedId === id) idx.lastOpenedId = null
      }),
    restore: (id) =>
      change([], (_tx, idx) => {
        delete boardIn(idx, id).deletedAt
      }),
    purge: (id) =>
      change(['boards', 'thumbs'], (tx, idx) => {
        tx.objectStore('boards').delete(id)
        tx.objectStore('thumbs').delete(id)
        idx.boards = idx.boards.filter((b) => b.id !== id)
        if (idx.lastOpenedId === id) idx.lastOpenedId = null
      }),
    saveTemplate: (name, bytes, thumb) =>
      change(['templates', 'templateThumbs'], (tx, idx) => {
        const entry: TemplateEntry = { id: uid(), name: name.trim() || 'Template', createdAt: Date.now() }
        tx.objectStore('templates').put(bytes, entry.id)
        if (thumb) tx.objectStore('templateThumbs').put(thumb, entry.id)
        idx.templates.push(entry)
        return { ...entry }
      }),
    replaceTemplate: (id, bytes, thumb) =>
      change(['templates', 'templateThumbs'], (tx, idx) => {
        const t = idx.templates.find((x) => x.id === id)
        if (!t) return null
        tx.objectStore('templates').put(bytes, id)
        if (thumb) tx.objectStore('templateThumbs').put(thumb, id)
        t.updatedAt = Date.now()
        return { ...t }
      }),
    async loadTemplate(id) {
      const bytes = await read('templates', id)
      if (!bytes) throw new Error('Template not found')
      return bytes
    },
    templateThumb: (id) => read('templateThumbs', id),
    renameTemplate: (id, name) =>
      change([], (_tx, idx) => {
        const t = idx.templates.find((x) => x.id === id)
        if (t && name.trim()) t.name = name.trim()
      }),
    deleteTemplate: (id) =>
      change(['templates', 'templateThumbs'], (tx, idx) => {
        idx.templates = idx.templates.filter((t) => t.id !== id)
        tx.objectStore('templates').delete(id)
        tx.objectStore('templateThumbs').delete(id)
      })
  }
  return api
}
