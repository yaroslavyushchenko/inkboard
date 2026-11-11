import { create } from 'zustand'
import type { BackgroundKind } from './engine/types'
import { detectLanguage, type Lang } from './i18n'

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'pan'

export interface InkSlot {
  color: string
  /** Width in world units (= screen px at 100% zoom). */
  size: number
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
  activePen: number
  pens: InkSlot[]
  highlighter: InkSlot
  /** Eraser radius in screen px. */
  eraserRadius: number
  background: BackgroundKind
  lang: Lang
  zoom: number
  canUndo: boolean
  canRedo: boolean
  setTool: (tool: Tool) => void
  selectPen: (index: number) => void
  updatePen: (index: number, patch: Partial<InkSlot>) => void
  updateHighlighter: (patch: Partial<InkSlot>) => void
  setBackground: (bg: BackgroundKind) => void
  setLang: (lang: Lang) => void
}

export const useUI = create<UIState>((set) => ({
  tool: 'pen',
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
  zoom: 1,
  canUndo: false,
  canRedo: false,
  setTool: (tool) => set({ tool }),
  selectPen: (index) => set({ tool: 'pen', activePen: index }),
  updatePen: (index, patch) =>
    set((s) => ({ pens: s.pens.map((p, i) => (i === index ? { ...p, ...patch } : p)) })),
  updateHighlighter: (patch) => set((s) => ({ highlighter: { ...s.highlighter, ...patch } })),
  setBackground: (background) => set({ background }),
  setLang: (lang) => set({ lang })
}))
