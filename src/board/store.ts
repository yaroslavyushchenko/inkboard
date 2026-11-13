/**
 * User preferences: pens, colours, language, theme, toolbar layout and the like. They are shared by
 * every open board and survive restarts. What belongs to one open board (tool, selection, camera,
 * instruments) lives in that board's session store (session.ts).
 */
import { useStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { GraphPreset } from './engine/graph'
import type { ShapeKind } from '@inkboard/core/shapes'
import { validateRows, type Cursor, type FormulaState, type Row } from '@inkboard/math/formula'
import { cleanInstrumentPrefs, DEFAULT_INSTRUMENTS, type InstrumentPrefs } from './engine/instruments'
import { cleanToolbarLayout, type ToolbarItemId } from './toolbarLayout'
import type { FullRun } from './engine/text'
import type { BackgroundKind, LineCap, LineDash } from '@inkboard/core/types'
import { detectLanguage, type Lang } from './i18n'

export type Tool = 'select' | 'brushSelect' | 'move' | 'pen' | 'highlighter' | 'eraser' | 'pan' | 'shape' | 'text' | 'laser'

/** 'stroke' removes whole strokes (like Whiteboard); 'point' cuts away only what it touches. */
export type EraserMode = 'stroke' | 'point'
/** What the plain mouse wheel does on the board. */
export type WheelMode = 'scroll' | 'zoom'

/** How long the pen is held still before a stroke snaps to a shape (ms). */
export const SNAP_DELAY = { min: 500, max: 2000, default: 1000 }

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

/**
 * No white: on the chalkboard dark ink is already shown as chalk white, so a real white pen would
 * look the same there and vanish on paper (and in exports).
 */
export const PEN_COLORS = [
  '#1e1e1e', '#5c5f66', '#e03131', '#f76707', '#f59f00',
  '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#8d5524'
]
export const HIGHLIGHTER_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#f783ac', '#ffa94d', '#b197fc']
export const PEN_SIZES = [1.5, 3, 5, 8, 12]
export const HIGHLIGHTER_SIZES = [12, 18, 26, 36]

export interface Prefs {
  penButtons: PenButtons
  setPenButton: (which: keyof PenButtons, action: PenAction) => void
  /** Colour and font size of new text. */
  textStyle: { color: string; size: number }
  /** Colour and font size of new formulas. */
  formulaStyle: { color: string; size: number }
  /** Formulas put on boards lately, newest first (the keypad's history). */
  formulaHistory: Row[]
  /** Chosen base (number of sides) for pyramids and prisms. */
  shapeBases: Partial<Record<ShapeKind, number>>
  /** The user's own coordinate-plane/line presets. */
  graphPresets: GraphPreset[]
  pens: InkSlot[]
  highlighter: InkSlot
  /** Brush-select circle radius in screen px (mouse wheel changes it). */
  selectRadius: number
  /** Eraser radius in screen px. */
  eraserRadius: number
  eraserMode: EraserMode
  wheelMode: WheelMode
  /** Hold the pen still at the end of a stroke to snap it to a clean shape. */
  shapeSnap: boolean
  /** How long to hold (ms). */
  shapeSnapDelay: number
  /** Background of the open board, remembered as the one for new boards. */
  background: BackgroundKind
  lang: Lang
  theme: ThemePref
  /** Protractor angle snapping. */
  instruments: InstrumentPrefs
  /** Instrument tips the user closed ("protractor", "compass"); they don't show again. */
  hiddenTips: string[]
  toolbarLayout: ToolbarItemId[] | null
  updatePen: (index: number, patch: Partial<InkSlot>) => void
  updateHighlighter: (patch: Partial<InkSlot>) => void
  setBackground: (bg: BackgroundKind) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: ThemePref) => void
}

export const prefsStore = createStore<Prefs>()(
  persist(
    (set) => ({
      shapeBases: {},
      selectRadius: 24,
      penButtons: DEFAULT_PEN_BUTTONS,
      setPenButton: (which, action) => set((s) => ({ penButtons: { ...s.penButtons, [which]: action } })),
      textStyle: { color: '#1e1e1e', size: 24 },
      formulaStyle: { color: '#1e1e1e', size: 32 },
      formulaHistory: [],
      graphPresets: [],
      pens: [
        { color: '#1e1e1e', size: 3 },
        { color: '#e03131', size: 3 },
        { color: '#1971c2', size: 3 }
      ],
      highlighter: { color: '#ffe066', size: 18 },
      eraserRadius: 12,
      eraserMode: 'stroke',
      wheelMode: 'scroll',
      shapeSnap: true,
      shapeSnapDelay: SNAP_DELAY.default,
      background: 'dots',
      lang: detectLanguage(),
      theme: 'system',
      instruments: DEFAULT_INSTRUMENTS,
      hiddenTips: [],
      toolbarLayout: null,
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
        const p = (saved ?? {}) as Partial<Prefs>
        return {
          ...current,
          ...p,
          penButtons: cleanPenButtons(p.penButtons),
          // White was removed from the palette: pens saved with it go back to black.
          ...(Array.isArray(p.pens) ? { pens: p.pens.map((pen) => (pen?.color?.toLowerCase() === '#ffffff' ? { ...pen, color: '#1e1e1e' } : pen)) } : {}),
          ...(p.textStyle?.color?.toLowerCase() === '#ffffff' ? { textStyle: { ...p.textStyle, color: '#1e1e1e' } } : {}),
          theme: THEME_PREFS.includes(p.theme as ThemePref) ? (p.theme as ThemePref) : 'system',
          eraserMode: p.eraserMode === 'point' ? 'point' : 'stroke',
          eraserRadius: typeof p.eraserRadius === 'number' && p.eraserRadius >= 4 && p.eraserRadius <= 120 ? p.eraserRadius : current.eraserRadius,
          wheelMode: p.wheelMode === 'zoom' ? 'zoom' : 'scroll',
          shapeSnap: typeof p.shapeSnap === 'boolean' ? p.shapeSnap : current.shapeSnap,
          // 700 ms was the first default (too eager): treat it as "never chosen" and use the current one.
          shapeSnapDelay:
            typeof p.shapeSnapDelay === 'number' && p.shapeSnapDelay !== 700 && p.shapeSnapDelay >= SNAP_DELAY.min && p.shapeSnapDelay <= SNAP_DELAY.max
              ? p.shapeSnapDelay
              : SNAP_DELAY.default,
          instruments: cleanInstrumentPrefs(p.instruments),
          toolbarLayout: cleanToolbarLayout(p.toolbarLayout),
          hiddenTips: Array.isArray(p.hiddenTips) ? p.hiddenTips.filter((x) => typeof x === 'string') : [],
          formulaHistory: cleanFormulaHistory(p.formulaHistory)
        }
      },
      partialize: (s) => ({
        pens: s.pens,
        highlighter: s.highlighter,
        eraserRadius: s.eraserRadius,
        eraserMode: s.eraserMode,
        wheelMode: s.wheelMode,
        shapeSnap: s.shapeSnap,
        shapeSnapDelay: s.shapeSnapDelay,
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
        instruments: s.instruments,
        toolbarLayout: s.toolbarLayout
      })
    }
  )
)

/** React binding for the preferences. */
export function usePrefs<T>(select: (s: Prefs) => T): T {
  return useStore(prefsStore, select)
}

export function enablePreferenceStorage(): void {
  prefsStore.persist.setOptions({ storage: createJSONStorage(() => localStorage) })
  void prefsStore.persist.rehydrate()
}
