import type { FeatureFlags, FeatureId } from './features'
import type { BoardEntry, ExportKind, LibraryState, Tag, TemplateEntry } from './library'

/**
 * The board library's storage: boards, thumbnails, tags and templates. Each platform has its own
 * (SQLite in the Electron main process, IndexedDB in the browser) behind this same interface.
 */
export interface BoardStoreApi {
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
  saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry>
  replaceTemplate(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry | null>
  loadTemplate(id: string): Promise<Uint8Array>
  templateThumb(id: string): Promise<Uint8Array | null>
  renameTemplate(id: string, name: string): Promise<void>
  deleteTemplate(id: string): Promise<void>
}

/** .inkboard files outside the library: native dialogs on the desktop, file pickers or downloads in the browser. */
export interface BoardFilesApi {
  /** Ask for a path and turn the board into a .inkboard file there. null = cancelled. */
  saveAsFile(id: string, bytes: Uint8Array, suggestedName: string): Promise<BoardEntry | null>
  /** Pick an existing .inkboard file and add it to the library. null = cancelled. */
  importFile(): Promise<BoardEntry | null>
  locate(id: string): Promise<BoardEntry | null>
  showInFolder(id: string): Promise<void>
  /** A board file the app was launched with ("Open with Inkboard"), already imported. */
  takePendingOpen(): Promise<string | null>
}

/** What the app shell sees: the library and the files together (the Electron preload exposes both as one). */
export type LibraryApi = BoardStoreApi & BoardFilesApi

export interface UpdateState {
  /** 'web': the browser version, which updates itself when the page is reloaded. */
  status: 'idle' | 'dev' | 'store' | 'web' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
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
  /** Feature flags as read at startup (defaults + features.json overrides). */
  features: FeatureFlags
  /** Turn a feature on or off and save the choice; resolves to the new flags. */
  setFeature(id: FeatureId, on: boolean): Promise<FeatureFlags>
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
