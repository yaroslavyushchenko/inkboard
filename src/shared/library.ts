/** Types shared by the main process (library storage) and the renderer (home screen). */

export const TAG_COLORS = ['#e03131', '#f76707', '#f59f00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c']

export interface Tag {
  id: string
  name: string
  color: string
}

export interface BoardEntry {
  id: string
  title: string
  /** draft = lives in the app's hidden library folder; file = a .inkboard file the user saved somewhere. */
  kind: 'draft' | 'file'
  filePath?: string
  createdAt: number
  updatedAt: number
  openedAt: number
  pinned?: boolean
  /** Set when moved to "Recently deleted". */
  deletedAt?: number
  tagIds: string[]
  /** Computed when listing: the file of a file-backed board can't be found. */
  missing?: boolean
}

/** A reusable piece of a board ("Given / Find / Solution", a diagram…) inserted into any board. */
export interface TemplateEntry {
  id: string
  name: string
  createdAt: number
  /** Set when the template's content was replaced. */
  updatedAt?: number
}

export interface LibraryState {
  boards: BoardEntry[]
  tags: Tag[]
  templates: TemplateEntry[]
  lastOpenedId: string | null
  backupDir: string | null
}

export interface VersionInfo {
  ts: number
  size: number
}

export type ExportKind = 'png' | 'pdf'

/** Days a deleted board stays in "Recently deleted". */
export const TRASH_DAYS = 30
/** Minimum time between version-history snapshots of one board. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000
export const SNAPSHOTS_KEPT = 20
