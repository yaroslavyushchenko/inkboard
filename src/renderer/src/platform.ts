import {
  SNAPSHOTS_KEPT,
  SNAPSHOT_INTERVAL_MS,
  type BoardEntry,
  type ExportKind,
  type LibraryState,
  type Tag,
  type TemplateEntry,
  type VersionInfo
} from '../../shared/library'

/**
 * Bridge to the board library and the file system. In Electron it goes through the preload API
 * (src/preload/index.ts → src/main/library.ts). In a plain browser — used for quick UI testing — a
 * localStorage-backed fallback with the same behaviour is used.
 */
export interface LibraryApi {
  list(): Promise<LibraryState>
  thumb(id: string): Promise<Uint8Array | null>
  create(title: string, bytes: Uint8Array): Promise<BoardEntry>
  load(id: string): Promise<Uint8Array>
  save(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<{ ok: boolean; updatedAt: number }>
  setLastOpened(id: string): Promise<void>
  rename(id: string, title: string): Promise<BoardEntry>
  duplicate(id: string): Promise<BoardEntry>
  pin(id: string, on: boolean): Promise<void>
  setTags(id: string, tagIds: string[]): Promise<void>
  createTag(name: string, color: string): Promise<Tag>
  updateTag(id: string, patch: { name?: string; color?: string }): Promise<void>
  deleteTag(id: string): Promise<void>
  remove(id: string): Promise<void>
  restore(id: string): Promise<void>
  purge(id: string): Promise<void>
  listVersions(id: string): Promise<VersionInfo[]>
  loadVersion(id: string, ts: number): Promise<Uint8Array>
  snapshot(id: string, bytes: Uint8Array): Promise<void>
  /** Ask for a path and turn the board into a .inkboard file there. null = cancelled. */
  saveAsFile(id: string, bytes: Uint8Array, suggestedName: string): Promise<BoardEntry | null>
  /** Pick an existing .inkboard file and add it to the library. null = cancelled. */
  importFile(): Promise<BoardEntry | null>
  locate(id: string): Promise<BoardEntry | null>
  showInFolder(id: string): Promise<void>
  /** A board file the app was launched with ("Open with Inkboard"), already imported. */
  takePendingOpen(): Promise<string | null>
  saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry>
  loadTemplate(id: string): Promise<Uint8Array>
  templateThumb(id: string): Promise<Uint8Array | null>
  renameTemplate(id: string, name: string): Promise<void>
  deleteTemplate(id: string): Promise<void>
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  manual?: boolean
  url?: string
}

export interface UpdateApi {
  getState(): Promise<UpdateState>
  check(): Promise<void>
  /** Restart into the downloaded update (the board must be saved first). */
  install(): Promise<void>
  openDownload(): Promise<void>
  version(): Promise<string>
  onState(handler: (s: UpdateState) => void): void
}

export interface PlatformApi {
  platform: string
  update: UpdateApi
  capabilities: { backup: boolean; showInFolder: boolean }
  library: LibraryApi
  /** Returns the chosen backup folder (or the current one if cancelled). */
  chooseBackupDir(): Promise<string | null>
  disableBackup(): Promise<void>
  /** PNG: `data` is the image bytes. PDF: `data` is an SVG document of size width×height px. */
  exportFile(kind: ExportKind, data: Uint8Array | string, suggestedName: string, width: number, height: number): Promise<string | null>
  setTitle(title: string): void
  onOpenBoard(handler: (id: string) => void): void
  onFlushRequest(handler: () => Promise<void>): void
  onBeforeClose(handler: () => Promise<void>): void
}

declare global {
  interface Window {
    inkboard?: PlatformApi
  }
}

// ---------------------------------------------------------------------------- browser fallback

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const KEY = 'inkboard-lib'
const uid = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36)
const store = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(`${KEY}:${k}`)
    } catch {
      return null
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem(`${KEY}:${k}`, v)
    } catch (err) {
      console.warn('Browser storage full (browser mode is for testing only)', err)
    }
  },
  del: (k: string): void => {
    try {
      localStorage.removeItem(`${KEY}:${k}`)
    } catch {
      // ignore
    }
  }
}

function readIndex(): LibraryState {
  try {
    return JSON.parse(store.get('index') ?? '') as LibraryState
  } catch {
    return { boards: [], tags: [], templates: [], lastOpenedId: null, backupDir: null }
  }
}

function browserLibrary(): LibraryApi {
  let idx = readIndex()
  const save = (): void => store.set('index', JSON.stringify(idx))
  const get = (id: string): BoardEntry => {
    const b = idx.boards.find((x) => x.id === id)
    if (!b) throw new Error(`Unknown board ${id}`)
    return b
  }
  const versions = (id: string): number[] => JSON.parse(store.get(`versions:${id}`) ?? '[]') as number[]
  // Allows testing version history quickly: localStorage['inkboard-snapshot-ms'] = '5000'
  const snapshotMs = (): number => Number(localStorage.getItem('inkboard-snapshot-ms')) || SNAPSHOT_INTERVAL_MS
  const snapshot = async (id: string, bytes: Uint8Array): Promise<void> => {
    const ts = Date.now()
    store.set(`version:${id}:${ts}`, toB64(bytes))
    const list = [ts, ...versions(id)]
    for (const old of list.slice(SNAPSHOTS_KEPT)) store.del(`version:${id}:${old}`)
    store.set(`versions:${id}`, JSON.stringify(list.slice(0, SNAPSHOTS_KEPT)))
  }
  const api: LibraryApi = {
    async list() {
      idx = readIndex()
      idx.templates ??= []
      return structuredClone(idx)
    },
    async thumb(id) {
      const b = store.get(`thumb:${id}`)
      return b ? fromB64(b) : null
    },
    async create(title, bytes) {
      const now = Date.now()
      const entry: BoardEntry = { id: uid(), title, kind: 'draft', createdAt: now, updatedAt: now, openedAt: now, tagIds: [] }
      store.set(`board:${entry.id}`, toB64(bytes))
      idx.boards.push(entry)
      idx.lastOpenedId = entry.id
      save()
      return { ...entry }
    },
    async load(id) {
      const b = store.get(`board:${id}`)
      if (!b) throw new Error('Board data not found')
      return fromB64(b)
    },
    async save(id, bytes, thumb) {
      const b = get(id)
      store.set(`board:${id}`, toB64(bytes))
      if (thumb) store.set(`thumb:${id}`, toB64(thumb))
      b.updatedAt = Date.now()
      save()
      const v = versions(id)
      if (!v.length || Date.now() - v[0] >= snapshotMs()) await snapshot(id, bytes)
      return { ok: true, updatedAt: b.updatedAt }
    },
    async setLastOpened(id) {
      get(id).openedAt = Date.now()
      idx.lastOpenedId = id
      save()
    },
    async rename(id, title) {
      const b = get(id)
      b.title = title.trim() || b.title
      save()
      return { ...b }
    },
    async duplicate(id) {
      const src = get(id)
      const copy = await api.create(`${src.title} (copy)`, await api.load(id))
      const t = store.get(`thumb:${id}`)
      if (t) store.set(`thumb:${copy.id}`, t)
      get(copy.id).tagIds = [...src.tagIds]
      save()
      return { ...get(copy.id) }
    },
    async pin(id, on) {
      get(id).pinned = on || undefined
      save()
    },
    async setTags(id, tagIds) {
      get(id).tagIds = tagIds
      save()
    },
    async createTag(name, color) {
      const tag = { id: uid(), name: name.trim() || 'Tag', color }
      idx.tags.push(tag)
      save()
      return tag
    },
    async updateTag(id, patch) {
      const t = idx.tags.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
      save()
    },
    async deleteTag(id) {
      idx.tags = idx.tags.filter((t) => t.id !== id)
      for (const b of idx.boards) b.tagIds = b.tagIds.filter((t) => t !== id)
      save()
    },
    async remove(id) {
      get(id).deletedAt = Date.now()
      if (idx.lastOpenedId === id) idx.lastOpenedId = null
      save()
    },
    async restore(id) {
      delete get(id).deletedAt
      save()
    },
    async purge(id) {
      store.del(`board:${id}`)
      store.del(`thumb:${id}`)
      for (const v of versions(id)) store.del(`version:${id}:${v}`)
      store.del(`versions:${id}`)
      idx.boards = idx.boards.filter((b) => b.id !== id)
      save()
    },
    async listVersions(id) {
      return versions(id).map((ts) => ({ ts, size: (store.get(`version:${id}:${ts}`)?.length ?? 0) * 0.75 }))
    },
    async loadVersion(id, ts) {
      const b = store.get(`version:${id}:${ts}`)
      if (!b) throw new Error('Version not found')
      return fromB64(b)
    },
    snapshot,
    async saveAsFile(id, bytes, suggestedName) {
      // Browser mode: download the file; the board stays in the (browser) library.
      download(bytes, `${suggestedName}.inkboard`)
      return { ...get(id) }
    },
    importFile() {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.inkboard'
        input.onchange = async () => {
          const f = input.files?.[0]
          if (!f) return resolve(null)
          resolve(await api.create(f.name.replace(/\.inkboard$/i, ''), new Uint8Array(await f.arrayBuffer())))
        }
        input.click()
      })
    },
    async locate() {
      return null
    },
    async showInFolder() {},
    async takePendingOpen() {
      return null
    },
    async saveTemplate(name, bytes, thumb) {
      const entry: TemplateEntry = { id: uid(), name: name.trim() || 'Template', createdAt: Date.now() }
      store.set(`tpl:${entry.id}`, toB64(bytes))
      if (thumb) store.set(`tplthumb:${entry.id}`, toB64(thumb))
      ;(idx.templates ??= []).push(entry)
      save()
      return entry
    },
    async loadTemplate(id) {
      const b = store.get(`tpl:${id}`)
      if (!b) throw new Error('Template not found')
      return fromB64(b)
    },
    async templateThumb(id) {
      const b = store.get(`tplthumb:${id}`)
      return b ? fromB64(b) : null
    },
    async renameTemplate(id, name) {
      const t = idx.templates.find((x) => x.id === id)
      if (t && name.trim()) t.name = name.trim()
      save()
    },
    async deleteTemplate(id) {
      idx.templates = idx.templates.filter((t) => t.id !== id)
      store.del(`tpl:${id}`)
      store.del(`tplthumb:${id}`)
      save()
    }
  }
  return api
}

function download(data: Uint8Array | string, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data as BlobPart]))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const browserApi: PlatformApi = {
  platform: 'browser',
  update: {
    async getState() {
      return { status: 'idle' }
    },
    async check() {},
    async install() {},
    async openDownload() {},
    async version() {
      return 'dev'
    },
    onState() {}
  },
  capabilities: { backup: false, showInFolder: false },
  library: browserLibrary(),
  async chooseBackupDir() {
    return null
  },
  async disableBackup() {},
  async exportFile(kind, data, suggestedName) {
    // Browser mode has no PDF printer: PDF exports download the SVG instead.
    download(data, `${suggestedName}.${kind === 'pdf' ? 'svg' : kind}`)
    return suggestedName
  },
  setTitle(title) {
    document.title = title
  },
  onOpenBoard() {},
  onFlushRequest() {},
  onBeforeClose(handler) {
    window.addEventListener('pagehide', () => void handler())
  }
}

export const platform: PlatformApi = window.inkboard ?? browserApi
