/**
 * THE single list of keyboard shortcuts. The keydown handler (ui/Board.tsx) and the
 * "Keyboard shortcuts" dialog both read from here; docs/SHORTCUTS.md mirrors it and
 * tests/shortcuts.test.ts checks it.
 *
 * Rules:
 * - Match on the PHYSICAL key (`KeyboardEvent.code`), never on the typed character (`key`), so every
 *   shortcut works on any keyboard layout (Ukrainian, German, …). Ctrl+Z is Ctrl+Z even when the key
 *   types "я".
 * - Don't change or remove an existing shortcut without the user's OK: people (and Wacom
 *   ExpressKeys) rely on them. Add new ones here, in docs/SHORTCUTS.md and in the test.
 *
 * This file must stay free of runtime imports so the Node test runner can load it directly.
 */

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'newBoard'
  | 'openFile'
  | 'home'
  | 'save'
  | 'saveAs'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'selectAll'
  | 'duplicate'
  | 'group'
  | 'ungroup'
  | 'delete'
  | 'escape'
  | 'pen1'
  | 'pen2'
  | 'pen3'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'swapEraser'
  | 'lasso'
  | 'brushSelect'
  | 'move'
  | 'protractor'
  | 'compass'

export type ShortcutGroup = 'tools' | 'editing' | 'view'

export interface Shortcut {
  id: ShortcutId
  /** Physical keys (KeyboardEvent.code) that trigger it. */
  codes: string[]
  /** Ctrl (or ⌘ on macOS) must be held. */
  mod: boolean
  /** true = Shift must be held, false = Shift must NOT be held. */
  shift: boolean
  /** 'app' works on the home screen too; 'board' only while a board is shown. */
  scope: 'app' | 'board'
  /** How it's written in the UI and docs. */
  display: string
  group: ShortcutGroup
  /** i18n key of the description. */
  label: string
  /** Alternative binding of an action already listed (not shown separately in the dialog). */
  alias?: boolean
}

const S = (s: Omit<Shortcut, 'scope'> & { scope?: Shortcut['scope'] }): Shortcut => ({ scope: 'board', ...s })

export const SHORTCUTS: Shortcut[] = [
  // Tools
  S({ id: 'pen1', codes: ['Digit1', 'Numpad1'], mod: false, shift: false, display: '1', group: 'tools', label: 'shortcuts.pen1' }),
  S({ id: 'pen2', codes: ['Digit2', 'Numpad2'], mod: false, shift: false, display: '2', group: 'tools', label: 'shortcuts.pen2' }),
  S({ id: 'pen3', codes: ['Digit3', 'Numpad3'], mod: false, shift: false, display: '3', group: 'tools', label: 'shortcuts.pen3' }),
  S({ id: 'pen', codes: ['KeyP'], mod: false, shift: false, display: 'P', group: 'tools', label: 'shortcuts.pen' }),
  S({ id: 'highlighter', codes: ['KeyH'], mod: false, shift: false, display: 'H', group: 'tools', label: 'shortcuts.highlighter' }),
  S({ id: 'eraser', codes: ['KeyE'], mod: false, shift: false, display: 'E', group: 'tools', label: 'shortcuts.eraser' }),
  S({ id: 'swapEraser', codes: ['KeyX'], mod: false, shift: false, display: 'X', group: 'tools', label: 'shortcuts.swap' }),
  S({ id: 'lasso', codes: ['KeyV'], mod: false, shift: false, display: 'V', group: 'tools', label: 'shortcuts.lasso' }),
  S({ id: 'brushSelect', codes: ['KeyC'], mod: false, shift: false, display: 'C', group: 'tools', label: 'shortcuts.brushSelect' }),
  S({ id: 'move', codes: ['KeyM'], mod: false, shift: false, display: 'M', group: 'tools', label: 'shortcuts.move' }),
  S({ id: 'protractor', codes: ['KeyT'], mod: false, shift: false, display: 'T', group: 'tools', label: 'shortcuts.protractor' }),
  S({ id: 'compass', codes: ['KeyK'], mod: false, shift: false, display: 'K', group: 'tools', label: 'shortcuts.compass' }),
  // Editing
  S({ id: 'undo', codes: ['KeyZ'], mod: true, shift: false, display: 'Ctrl+Z', group: 'editing', label: 'shortcuts.undo' }),
  S({ id: 'redo', codes: ['KeyY'], mod: true, shift: false, display: 'Ctrl+Y', group: 'editing', label: 'shortcuts.redo' }),
  S({ id: 'redo', codes: ['KeyZ'], mod: true, shift: true, display: 'Ctrl+Shift+Z', group: 'editing', label: 'shortcuts.redo', alias: true }),
  S({ id: 'group', codes: ['KeyG'], mod: true, shift: false, display: 'Ctrl+G', group: 'editing', label: 'shortcuts.group' }),
  S({ id: 'ungroup', codes: ['KeyG'], mod: true, shift: true, display: 'Ctrl+Shift+G', group: 'editing', label: 'shortcuts.ungroup' }),
  S({ id: 'duplicate', codes: ['KeyD'], mod: true, shift: false, display: 'Ctrl+D', group: 'editing', label: 'shortcuts.duplicate' }),
  S({ id: 'delete', codes: ['Delete', 'Backspace'], mod: false, shift: false, display: 'Del', group: 'editing', label: 'shortcuts.delete' }),
  S({ id: 'escape', codes: ['Escape'], mod: false, shift: false, display: 'Esc', group: 'editing', label: 'shortcuts.escape' }),
  S({ id: 'selectAll', codes: ['KeyA'], mod: true, shift: false, display: 'Ctrl+A', group: 'editing', label: 'shortcuts.selectAll' }),
  // View & boards
  S({ id: 'zoomIn', codes: ['Equal', 'NumpadAdd'], mod: true, shift: false, display: 'Ctrl +', group: 'view', label: 'shortcuts.zoomIn' }),
  S({ id: 'zoomIn', codes: ['Equal'], mod: true, shift: true, display: 'Ctrl +', group: 'view', label: 'shortcuts.zoomIn', alias: true }),
  S({ id: 'zoomOut', codes: ['Minus', 'NumpadSubtract'], mod: true, shift: false, display: 'Ctrl −', group: 'view', label: 'shortcuts.zoomOut' }),
  S({ id: 'zoomReset', codes: ['Digit0', 'Numpad0'], mod: true, shift: false, display: 'Ctrl+0', group: 'view', label: 'shortcuts.zoomReset' }),
  S({ id: 'home', codes: ['KeyH'], mod: true, shift: false, display: 'Ctrl+H', group: 'view', label: 'shortcuts.home' }),
  S({ id: 'newBoard', codes: ['KeyN'], mod: true, shift: false, display: 'Ctrl+N', group: 'view', label: 'shortcuts.new', scope: 'app' }),
  S({ id: 'openFile', codes: ['KeyO'], mod: true, shift: false, display: 'Ctrl+O', group: 'view', label: 'shortcuts.open', scope: 'app' }),
  S({ id: 'save', codes: ['KeyS'], mod: true, shift: false, display: 'Ctrl+S', group: 'view', label: 'shortcuts.save' }),
  S({ id: 'saveAs', codes: ['KeyS'], mod: true, shift: true, display: 'Ctrl+Shift+S', group: 'view', label: 'shortcuts.saveAs' })
]

/**
 * Held keys that aren't one-shot actions (handled separately in the board):
 * Space = hold to pan, Shift while drawing = straight line. Listed here for the dialog and docs.
 */
export const HOLD_KEYS = [
  { display: 'Space', group: 'tools' as ShortcutGroup, label: 'shortcuts.pan' },
  { display: 'Shift', group: 'editing' as ShortcutGroup, label: 'shortcuts.straight' }
]

/** Copy / paste use the system clipboard events, not this table (Ctrl+C, Ctrl+X, Ctrl+V). */
export const CLIPBOARD_KEYS = { display: 'Ctrl+C / Ctrl+X / Ctrl+V', group: 'editing' as ShortcutGroup, label: 'shortcuts.copyPaste' }

export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Find the shortcut for a key press (layout-independent). */
export function matchShortcut(e: KeyLike, scope: 'app' | 'board'): Shortcut | null {
  if (e.altKey) return null
  const mod = e.ctrlKey || e.metaKey
  for (const s of SHORTCUTS) {
    if (s.mod !== mod || s.shift !== e.shiftKey) continue
    if (scope === 'app' && s.scope !== 'app') continue
    if (s.codes.includes(e.code)) return s
  }
  return null
}
