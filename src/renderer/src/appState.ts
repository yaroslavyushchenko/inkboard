import { create } from 'zustand'
import type { LibraryState } from '../../shared/library'

/**
 * State of the desktop app around the board: which screen is shown, which board is open, saving and
 * updates. The board itself never reads it: it only gets told whether it's on screen (Session.active).
 */
export interface AppState {
  /** Which screen is shown: the board or the home screen with all boards. */
  view: 'board' | 'home'
  /** The open board. */
  board: { id: string; title: string; kind: 'draft' | 'file'; filePath?: string } | null
  saveStatus: 'saved' | 'pending' | 'saving' | 'error'
  library: LibraryState
  /** Set for one launch after the app was updated (shows "Updated to X"). */
  justUpdatedTo: string | null
  appVersion: string
}

export const useApp = create<AppState>()(() => ({
  view: 'board',
  board: null,
  saveStatus: 'saved',
  library: { boards: [], tags: [], templates: [], lastOpenedId: null, backupDir: null },
  justUpdatedTo: null,
  appVersion: ''
}))
