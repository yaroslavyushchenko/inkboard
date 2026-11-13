import type { BackgroundKind, PaperPattern } from '@inkboard/core/types'

/**
 * Board surfaces: white paper (the classic look) and a dark green lecture chalkboard
 * (feature flag `chalkboard`). The surface is part of the board's `background` value
 * ("grid" = paper with a grid, "chalk-grid" = chalkboard with a grid), so it is saved with the board.
 *
 * Ink is stored exactly as drawn. On the chalkboard, dark ink colours are only *displayed* lighter
 * (black becomes chalk white, dark colours become pastel chalk), so the default black pen, black text
 * and coordinate planes stay readable, and switching the board back to paper shows the original
 * colours again. Board data never changes because of the surface.
 */

export const PAPER_PATTERNS: readonly PaperPattern[] = ['blank', 'dots', 'grid', 'lines', 'math', 'hand', 'slant']
/** Patterns added in format version 9 (older apps can't draw them). */
export const SCHOOL_PATTERNS: readonly PaperPattern[] = ['math', 'hand', 'slant']

export const PAPER_COLOR = '#ffffff'
/** Classic lecture-hall green board. */
export const CHALKBOARD_COLOR = '#2f4a3d'
/** What near-black ink looks like on the chalkboard. */
export const CHALK_WHITE = '#f2f0e8'

export const isChalk = (bg: BackgroundKind): boolean => bg.startsWith('chalk-')
export const bgPattern = (bg: BackgroundKind): PaperPattern => (isChalk(bg) ? (bg.slice(6) as PaperPattern) : (bg as PaperPattern))
export const withPattern = (bg: BackgroundKind, p: PaperPattern): BackgroundKind => (isChalk(bg) ? `chalk-${p}` : p)
export const withSurface = (bg: BackgroundKind, chalk: boolean): BackgroundKind => (chalk ? `chalk-${bgPattern(bg)}` : bgPattern(bg))
export const surfaceColor = (bg: BackgroundKind): string => (isChalk(bg) ? CHALKBOARD_COLOR : PAPER_COLOR)

export function isBackgroundKind(v: unknown): v is BackgroundKind {
  if (typeof v !== 'string') return false
  const p = v.startsWith('chalk-') ? v.slice(6) : v
  return (PAPER_PATTERNS as readonly string[]).includes(p)
}

// ---------------------------------------------------------------------------- chalk colours

function parseHex(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const hex = (rgb: number[]): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(rgb: readonly number[]): number {
  const lin = rgb.map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** Below this, ink is too dark to read on the green board and is shown lighter. */
const MIN_CHALK_LUMINANCE = 0.22

/** How an ink colour is shown on the chalkboard. Unparseable colours are left as they are. */
export function chalkColor(c: string): string {
  const rgb = parseHex(c)
  if (!rgb) return c
  const l = luminance(rgb)
  if (l >= MIN_CHALK_LUMINANCE) return c
  if (l < 0.03) return CHALK_WHITE
  // Mix towards white until it reads well, keeping the hue (pastel chalk).
  for (let t = 0.1; t < 0.95; t += 0.05) {
    const mixed = rgb.map((v) => v + (255 - v) * t)
    if (luminance(mixed) >= MIN_CHALK_LUMINANCE) return hex(mixed)
  }
  return CHALK_WHITE
}

// ---------------------------------------------------------------------------- active surface

/**
 * Surface of the board being drawn right now. Drawing is synchronous, so the renderer sets it
 * around each pass (`withInkSurface`) instead of threading it through every draw function.
 * Paper (the common case) costs one boolean check per colour.
 */
let chalkInk = false
const chalkCache = new Map<string, string>()

/** Colour to draw `c` with on the current surface. */
export function inkColor(c: string): string {
  if (!chalkInk) return c
  let m = chalkCache.get(c)
  if (m === undefined) {
    m = chalkColor(c)
    chalkCache.set(c, m)
  }
  return m
}

/** Paper-coloured details (halo under graph labels, hollow line ends) on the current surface. */
export const inkPaper = (): string => (chalkInk ? CHALKBOARD_COLOR : PAPER_COLOR)

/** Highlighter blending: darken on paper, lighten on the dark board (multiply would vanish there). */
export const highlightBlend = (): GlobalCompositeOperation => (chalkInk ? 'screen' : 'multiply')

export function withInkSurface<T>(bg: BackgroundKind, draw: () => T): T {
  const prev = chalkInk
  chalkInk = isChalk(bg)
  try {
    return draw()
  } finally {
    chalkInk = prev
  }
}
