import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LibraryState } from '../shared/library'
import type { GraphPreset } from './engine/graph'
import type { ShapeKind } from './engine/shapes'
import type { Protractor } from './engine/protractor'
import type { Compass } from './engine/compass'
import type { Straightedge } from './engine/straightedge'
import { validateRows, type Cursor, type FormulaState, type Row } from './engine/formula'
import { cleanInstrumentPrefs, DEFAULT_INSTRUMENTS, type InstrumentPrefs } from './engine/instruments'
import type { FullRun } from './engine/text'
import type { BackgroundKind, Camera, GraphParams, LineCap, LineDash } from './engine/types'
import { detectLanguage, type Lang } from './i18n'

export type Tool = 'select' | 'brushSelect' | 'move' | 'pen' | 'highlighter' | 'eraser' | 'pan' | 'shape' | 'text'

/** How many recent formulas the keypad remembers. */
export const FORMULA_HISTORY = 20

const cleanFormulaHistory = (v: unknown): Row[] =>
  Array.isArray(v) ? v.map((r) => validateRows(r)).filter((r): r is Row => !!r && r.length > 0).slice(0, FORMULA_HISTORY) : []

/** Text being typed on the board (a new one, or an existing item while it's edited). */
export interface TextEdit {
  id?: string
  x: number
  y: number
  /** Base size / colour: what new characters typed into an empty box get. */
  size: number
  color: string
  runs: FullRun[]
}

/**
 * A formula being built on the board (a new one, or an existing item while it's edited). Anchored
 * at the left end of its baseline, so it doesn't jump while fractions and roots make it taller.
 */
export interface FormulaEdit {
  id?: string
  x: number
  baseline: number
  size: number
  color: string
  rows: Row
  cur: Cursor
}

/** Where the math keypad types: the formula field that has the focus. */
export interface MathTarget {
  apply: (f: (st: FormulaState) => FormulaState) => void
  /** The current formula, for keys that depend on it. */
  get: () => FormulaState
  /** Enter on the keypad. */
  done: () => void
  /** The field is a function of x for a plot: the keypad leads with x. */
  plot: boolean
}

/**
 * What a pen button does while it's held (the Wacom driver decides which button the browser sees).
 * No "move" actions: a stuck button state must never leave the pen dragging things around.
 */
export type PenAction = 'eraser' | 'select' | 'tool'
const PEN_ACTIONS: readonly PenAction[] = ['eraser', 'select', 'tool']

export interface PenButtons {
  /** Lower side switch; arrives as the right button (button 2). */
  lower: PenAction
  /** Upper side switch; arrives as the middle button (button 1) when set to "Middle click" in the driver. */
  upper: PenAction
  /** Eraser end of the pen (button 5). */
  eraserEnd: PenAction
}

export const DEFAULT_PEN_BUTTONS: PenButtons = { lower: 'eraser', upper: 'tool', eraserEnd: 'eraser' }

/** Saved settings from older versions may hold actions that no longer exist ("pan", "move"). */
export function cleanPenButtons(v: unknown): PenButtons {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const pick = (k: keyof PenButtons): PenAction =>
    PEN_ACTIONS.includes(o[k] as PenAction) ? (o[k] as PenAction) : DEFAULT_PEN_BUTTONS[k]
  return { lower: pick('lower'), upper: pick('upper'), eraserEnd: pick('eraserEnd') }
}

/** App interface theme (only used while the `darkTheme` feature flag is on). */
export type ThemePref = 'system' | 'light' | 'dark'
const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

export interface InkSlot {
  color: string
  /** Width in world units (= screen px at 100% zoom). */
  size: number
  /** Line pattern for new strokes. */
  dash?: LineDash
  /** Line ends (arrow, dot…) of everything drawn with this pen. */
  startCap?: LineCap
  endCap?: LineCap
}

export const PEN_COLORS = [
  '#1e1e1e', '#5c5f66', '#ffffff', '#e03131', '#f76707', '#f59f00',
  '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#8d5524'
]
export const HIGHLIGHTER_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#f783ac', '#ffa94d', '#b197fc']
export const PEN_SIZES = [1.5, 3, 5, 8, 12]
export const HIGHLIGHTER_SIZES = [12, 18, 26, 36]

interface UIState {
  tool: Tool
  /** Shape drawn by the shape tool. */
  shape: ShapeKind
  penButtons: PenButtons
  setPenButton: (which: keyof PenButtons, action: PenAction) => void
  /** Colour and font size of new text. */
  textStyle: { color: string; size: number }
  textEdit: TextEdit | null
  /** Colour and font size of new formulas. */
  formulaStyle: { color: string; size: number }
  formulaEdit: FormulaEdit | null
  /** The focused formula field; the math keypad is shown while there is one. */
  mathTarget: MathTarget | null
  /** Formulas put on boards lately, newest first (the keypad's history). */
  formulaHistory: Row[]
  /** Chosen base (number of sides) for pyramids and prisms. */
  shapeBases: Partial<Record<ShapeKind, number>>
  /** The user's own coordinate-plane/line presets. */
  graphPresets: GraphPreset[]
  /** Coordinate settings dialog: insert a new graph or edit the selected one. */
  graphDialog: { mode: 'insert' | 'edit'; id?: string; params: GraphParams } | null
  /** Function panel docked beside the selected coordinate plane (`session` groups its edits into one undo step). */
  fnPanel: { id: string; session: number } | null
  activePen: number
  pens: InkSlot[]
  highlighter: InkSlot
  /** Brush-select circle radius in screen px (mouse wheel changes it). */
  selectRadius: number
  /** Eraser radius in screen px. */
  eraserRadius: number
  background: BackgroundKind
  lang: Lang
  theme: ThemePref
  /** Mirrors editor.camera so React chrome (zoom label, selection toolbar) can follow it. */
  camera: Camera
  zoom: number
  canUndo: boolean
  canRedo: boolean
  /** Bumped on every board change so chrome that reads items (selection bar) re-renders. */
  sceneVersion: number
  selectedIds: string[]
  /** Which screen is shown: the board or the home screen with all boards. */
  view: 'board' | 'home'
  /** The open board. */
  board: { id: string; title: string; kind: 'draft' | 'file'; filePath?: string } | null
  saveStatus: 'saved' | 'pending' | 'saving' | 'error'
  library: LibraryState
  shortcutsOpen: boolean
  /** Set for one launch after the app was updated (shows "Updated to X"). */
  justUpdatedTo: string | null
  appVersion: string
  /** On-board ruler, or null when hidden. */
  ruler: Straightedge | null
  /** On-board set square (45° or 30°/60°), or null when hidden. */
  setSquare: Straightedge | null
  /** On-board protractor, or null when hidden. */
  protractor: Protractor | null
  /** On-board compass, or null when hidden. */
  compass: Compass | null
  /** Protractor angle snapping. */
  instruments: InstrumentPrefs
  /** Settings card docked beside the protractor. */
  protractorPanel: boolean
  /** Instrument tips the user closed ("protractor", "compass"); they don't show again. */
  hiddenTips: string[]
  setTool: (tool: Tool) => void
  selectPen: (index: number) => void
  updatePen: (index: number, patch: Partial<InkSlot>) => void
  updateHighlighter: (patch: Partial<InkSlot>) => void
  setBackground: (bg: BackgroundKind) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: ThemePref) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      tool: 'pen',
      shape: 'rectangle',
      shapeBases: {},
      selectRadius: 24,
      penButtons: DEFAULT_PEN_BUTTONS,
      setPenButton: (which, action) => set((s) => ({ penButtons: { ...s.penButtons, [which]: action } })),
      textStyle: { color: '#1e1e1e', size: 24 },
      formulaStyle: { color: '#1e1e1e', size: 32 },
      formulaEdit: null,
      mathTarget: null,
      formulaHistory: [],
      textEdit: null,
      graphPresets: [],
      graphDialog: null,
      fnPanel: null,
      activePen: 0,
      pens: [
        { color: '#1e1e1e', size: 3 },
        { color: '#e03131', size: 3 },
        { color: '#1971c2', size: 3 }
      ],
      highlighter: { color: '#ffe066', size: 18 },
      eraserRadius: 12,
      background: 'dots',
      lang: detectLanguage(),
      theme: 'system',
      camera: { x: 0, y: 0, zoom: 1 },
      zoom: 1,
      canUndo: false,
      canRedo: false,
      sceneVersion: 0,
      selectedIds: [],
      view: 'board',
      board: null,
      saveStatus: 'saved',
      library: { boards: [], tags: [], templates: [], lastOpenedId: null, backupDir: null },
      shortcutsOpen: false,
      ruler: null,
      setSquare: null,
      protractor: null,
      compass: null,
      instruments: DEFAULT_INSTRUMENTS,
      protractorPanel: false,
      hiddenTips: [],
      justUpdatedTo: null,
      appVersion: '',
      setTool: (tool) => set({ tool }),
      selectPen: (index) => set({ tool: 'pen', activePen: index }),
      updatePen: (index, patch) =>
        set((s) => ({ pens: s.pens.map((p, i) => (i === index ? { ...p, ...patch } : p)) })),
      updateHighlighter: (patch) => set((s) => ({ highlighter: { ...s.highlighter, ...patch } })),
      setBackground: (background) => set({ background }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme })
    }),
    {
      // Only user preferences survive restarts; the board itself is restored from the autosave file.
      name: 'inkboard-settings',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      version: 1,
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<UIState>
        return {
          ...current,
          ...p,
          penButtons: cleanPenButtons(p.penButtons),
          theme: THEME_PREFS.includes(p.theme as ThemePref) ? (p.theme as ThemePref) : 'system',
          instruments: cleanInstrumentPrefs(p.instruments),
          hiddenTips: Array.isArray(p.hiddenTips) ? p.hiddenTips.filter((x) => typeof x === 'string') : [],
          formulaHistory: cleanFormulaHistory(p.formulaHistory)
        }
      },
      partialize: (s) => ({
        pens: s.pens,
        highlighter: s.highlighter,
        eraserRadius: s.eraserRadius,
        background: s.background,
        lang: s.lang,
        theme: s.theme,
        graphPresets: s.graphPresets,
        shapeBases: s.shapeBases,
        selectRadius: s.selectRadius,
        penButtons: s.penButtons,
        textStyle: s.textStyle,
        formulaStyle: s.formulaStyle,
        formulaHistory: s.formulaHistory,
        hiddenTips: s.hiddenTips,
        instruments: s.instruments
      })
    }
  )
)

export function enablePreferenceStorage(): void {
  useUI.persist.setOptions({ storage: createJSONStorage(() => localStorage) })
  void useUI.persist.rehydrate()
}
