import { paint } from '@inkboard/render-canvas/paint'
import { toSvg, type GroupPrim, type Prim } from '@inkboard/render/display'
import { inkColors } from './surface'
/**
 * Typesetting of keypad formulas (engine/formula.ts): the tree becomes the same vector primitives
 * as the labels of plotted functions (engine/mathtype.ts: text pieces and stroked polylines), so the
 * board canvas, PNG and SVG all draw it alike. For the editor the layout also reports where the
 * caret can stand and where the empty slots are.
 */
import type { Atom, Cursor, Row } from '@inkboard/math/formula'
import { hasBase } from '@inkboard/math/formula'
import {
  dropOf, empty, fence, frac, MATH_FONT, measureMath, put, radical, raiseOf, row, rule, SCRIPT, scripts, text,
  type Ctx, type MathBox, type MathMark, type Measure
} from './mathtype'
import type { BBox } from '@inkboard/core/types'

export interface FormulaLayout {
  box: MathBox
  /** Every place the caret can stand. */
  carets: MathMark[]
  /** Empty slots (drawn as dotted squares while editing). */
  holes: MathMark[]
  /** Missing bases of exponents and indices: shown like holes, filled by typing in front. */
  ghosts: MathMark[]
}

/** Signs set with a little air on both sides. */
const BINARY = '+−·×÷:=<>≤≥≠≈→±'
/** After these a + or − is a sign of the next number, not an operation. */
const OPENERS = '+−·×÷:=<>≤≥≠≈→±,;(|'
/** Height of the math axis (fraction bars, centres of big signs) above the baseline, in font sizes. */
const AXIS = 0.27

interface Lay {
  c: Ctx
  edit: boolean
}

const sub = (l: Lay, k: number): Lay => ({ ...l, c: { ...l.c, size: l.c.size * k, script: true } })
const shown = (s: string): string => (s === '-' ? '−' : s === '*' ? '·' : s)
const italicChar = (s: string): boolean => /^[a-zA-Z]$/.test(s) || (/^[α-ω]$/.test(s) && s !== 'π')

function layChar(l: Lay, r: Row, k: number, s: string): MathBox {
  const c = l.c
  const ch = shown(s)
  if (BINARY.includes(ch)) {
    const prev = r[k - 1]
    const sign = (ch === '−' || ch === '+' || ch === '±') && (!prev || (prev.t === 'c' && OPENERS.includes(shown(prev.s))))
    const gap = empty(sign ? 0 : c.size * (c.script ? 0.1 : 0.2))
    return row([gap, text(c, ch, false), gap])
  }
  if (ch === ',' || ch === ';') return row([text(c, ch, false), empty(c.size * 0.14)])
  return text(c, ch, italicChar(ch))
}

/** A sign drawn larger than the text and centred on the math axis (∫, ∑). */
function bigSign(c: Ctx, glyph: string, scale: number, top: number, bottom: number): MathBox {
  const s = c.size
  const size = s * scale
  // The glyph reaches `top` above and `bottom` below its own baseline (in its font sizes).
  const dy = ((top - bottom) / 2) * size - AXIS * s
  return {
    w: c.measure(glyph, size, false),
    asc: top * size - dy,
    desc: bottom * size + dy,
    texts: [{ x: 0, y: dy, s: glyph, size, italic: false }],
    lines: []
  }
}

/** `under` centred below `main` (and `over` above it); the baseline stays the one of `main`. */
function stack(c: Ctx, main: MathBox, under: MathBox | null, over: MathBox | null): MathBox {
  const gap = c.size * 0.06
  const w = Math.max(main.w, under?.w ?? 0, over?.w ?? 0)
  const out = empty(w)
  put(out, main, (w - main.w) / 2, 0)
  out.asc = main.asc
  out.desc = main.desc
  if (under) {
    const y = main.desc + gap + under.asc
    put(out, under, (w - under.w) / 2, y)
    out.desc = y + under.desc
  }
  if (over) {
    const y = -(main.asc + gap + over.desc)
    put(out, over, (w - over.w) / 2, y)
    out.asc = -y + over.asc
  }
  return out
}

function layAtom(l: Lay, r: Row, k: number, path: number[]): MathBox {
  const a = r[k]
  const c = l.c
  const s = c.size
  const p = [...path, k]
  const slot = (rr: Row, i: number, ll: Lay = l): MathBox => layRow(ll, rr, [...p, i])
  const small = sub(l, SCRIPT)
  switch (a.t) {
    case 'c':
      return layChar(l, r, k, a.s)
    case 'op': {
      const prev = r[k - 1]
      const next = r[k + 1]
      const lead = prev && !(prev.t === 'c' && OPENERS.includes(shown(prev.s))) ? s * 0.14 : 0
      const tail = !next ? 0 : next.t === 'script' || (next.t === 'fence' && next.k === 'paren') ? s * 0.03 : s * 0.16
      return row([empty(lead), text(c, a.s, false), empty(tail)])
    }
    case 'frac':
      return row([empty(s * 0.05), frac(c, slot(a.n, 0), slot(a.d, 1)), empty(s * 0.05)])
    case 'root':
      return a.i ? radical(c, slot(a.x, 1), slot(a.i, 0, sub(l, 0.5))) : radical(c, slot(a.x, 0))
    case 'fence':
      return fence(c, slot(a.x, 0), a.k)
    case 'over': {
      const inner = slot(a.x, 0)
      const out = row([inner])
      const y = -(inner.asc + s * 0.08)
      out.lines.push({ w: rule(c), pts: [[s * 0.02, y], [inner.w - s * 0.02, y]] })
      out.asc = -y + s * 0.08
      return out
    }
    case 'script':
      // Laid out by the row, which knows the base. Reached only for a stray atom.
      return empty()
    case 'comb': {
      const letter = text(c, a.s, false)
      const n = slot(a.n, 0, small)
      const kk = slot(a.k, 1, small)
      const lowered = (b: MathBox): MathBox => {
        const out = empty(b.w)
        const drop = dropOf(c, letter.desc, b)
        put(out, b, 0, drop)
        out.desc = drop + b.desc
        return out
      }
      return row([lowered(n), empty(s * 0.03), letter, empty(s * 0.03), lowered(kk)])
    }
    case 'lim': {
      const parts = [slot(a.v, 0, small), empty(small.c.size * 0.1), text(small.c, '→', false), empty(small.c.size * 0.1), slot(a.to, 1, small)]
      let under = row(parts)
      if (a.side) under = scripts(small.c, under, text({ ...small.c, size: small.c.size * 0.8 }, a.side === '+' ? '+' : '−', false), null)
      return row([stack(c, text(c, 'lim', false), under, null), empty(s * 0.16)])
    }
    case 'deriv': {
      const d = (): MathBox => text(c, 'd', true)
      if (!a.n) return row([empty(s * 0.05), frac(c, d(), row([d(), slot(a.v, 0)])), empty(s * 0.1)])
      const num = scripts(c, d(), slot(a.n, 0, small), null)
      // The order is written twice; the lower one is a copy that follows the upper slot.
      const den = scripts(c, row([d(), slot(a.v, 1)]), layRow({ ...small, edit: false }, a.n, []), null)
      return row([empty(s * 0.05), frac(c, num, den), empty(s * 0.1)])
    }
    case 'int': {
      const sign = bigSign(c, '∫', 1.7, 0.82, 0.22)
      const out = row([sign])
      const definite = a.lo && a.hi
      if (definite) {
        const lo = slot(a.lo!, 0, small)
        const hi = slot(a.hi!, 1, small)
        const hy = -(sign.asc - hi.asc * 0.7)
        const ly = sign.desc + lo.asc * 0.3
        put(out, hi, sign.w + s * 0.02, hy)
        put(out, lo, sign.w - s * 0.18, ly)
        out.w = Math.max(sign.w + s * 0.02 + hi.w, sign.w - s * 0.18 + lo.w)
        out.asc = Math.max(sign.asc, hi.asc - hy)
        out.desc = ly + lo.desc
      }
      const base = definite ? 2 : 0
      return row([out, empty(s * 0.1), slot(a.x, base), empty(s * 0.14), text(c, 'd', true), slot(a.v, base + 1), empty(s * 0.06)])
    }
    case 'sum': {
      const under = row([slot(a.i, 0, small), text(small.c, '=', false), slot(a.from, 1, small)])
      return row([stack(c, bigSign(c, '∑', 1.5, 0.74, 0.2), under, slot(a.to, 2, small)), empty(s * 0.14)])
    }
    case 'grid': {
      const cells = a.cells.map((cell, i) => slot(cell, i))
      const nRows = cells.length / a.cols
      const colW = Array.from({ length: a.cols }, (_, j) => Math.max(...cells.filter((_, i) => i % a.cols === j).map((b) => b.w)))
      const rowAsc = Array.from({ length: nRows }, (_, i) => Math.max(s * 0.7, ...cells.slice(i * a.cols, (i + 1) * a.cols).map((b) => b.asc)))
      const rowDesc = Array.from({ length: nRows }, (_, i) => Math.max(s * 0.2, ...cells.slice(i * a.cols, (i + 1) * a.cols).map((b) => b.desc)))
      const colGap = s * 0.7
      const rowGap = s * 0.3
      const height = rowAsc.reduce((n, v) => n + v, 0) + rowDesc.reduce((n, v) => n + v, 0) + rowGap * (nRows - 1)
      const pad = s * 0.12
      const inner = empty(colW.reduce((n, v) => n + v, 0) + colGap * (a.cols - 1) + pad * 2)
      let y = -AXIS * s - height / 2
      inner.asc = -y
      inner.desc = height + y
      for (let i = 0; i < nRows; i++) {
        y += rowAsc[i]
        let x = pad
        for (let j = 0; j < a.cols; j++) {
          const b = cells[i * a.cols + j]
          put(inner, b, x + (colW[j] - b.w) / 2, y)
          x += colW[j] + colGap
        }
        y += rowDesc[i] + rowGap
      }
      return fence(c, inner, a.k === 'matrix' ? 'square' : a.k === 'det' ? 'bar' : 'paren')
    }
  }
}

function layScript(l: Lay, a: Extract<Atom, { t: 'script' }>, path: number[], base: MathBox | null): MathBox {
  const c = l.c
  const s = c.size
  const small = sub(l, SCRIPT)
  const up = a.sup ? layRow(small, a.sup, [...path, 0]) : null
  const down = a.sub ? layRow(small, a.sub, [...path, a.sup ? 1 : 0]) : null
  const out = empty()
  let x = 0
  const baseAsc = base ? base.asc : s * 0.7
  const baseDesc = base ? base.desc : s * 0.2
  if (!base) {
    // Nothing to sit on yet: leave room for the base (the editor shows it as a dotted square).
    if (l.edit) out.marks = [{ kind: 'ghost', path: path.slice(0, -1), i: path[path.length - 1], x: s * 0.04, y: 0, w: s * 0.5, asc: s * 0.64, desc: s * 0.04 }]
    x = s * 0.58
    out.asc = s * 0.7
  }
  x += s * 0.04
  let w = 0
  if (up) {
    const raise = raiseOf(c, baseAsc, up)
    put(out, up, x, -raise)
    out.asc = Math.max(out.asc, raise + up.asc)
    out.desc = Math.max(out.desc, up.desc - raise)
    w = up.w
  }
  if (down) {
    const drop = dropOf(c, baseDesc, down)
    put(out, down, x, drop)
    out.desc = Math.max(out.desc, drop + down.desc)
    w = Math.max(w, down.w)
  }
  out.w = x + w
  return out
}

function layRow(l: Lay, r: Row, path: number[]): MathBox {
  const s = l.c.size
  const caret = (i: number, x: number): MathMark => ({ kind: 'caret', path, i, x, y: 0, w: 0, asc: s * 0.78, desc: s * 0.2 })
  if (!r.length) {
    const out = empty(l.edit ? s * 0.62 : s * 0.3)
    out.asc = s * 0.7
    out.desc = s * 0.1
    if (l.edit) out.marks = [{ kind: 'hole', path, i: 0, x: s * 0.06, y: 0, w: s * 0.5, asc: s * 0.64, desc: s * 0.04 }, caret(0, s * 0.31)]
    return out
  }
  const out = empty()
  const marks: MathMark[] = []
  let base: MathBox | null = null
  for (let k = 0; k < r.length; k++) {
    const a = r[k]
    if (l.edit) marks.push(caret(k, out.w))
    const b: MathBox = a.t === 'script' ? layScript(l, a, [...path, k], hasBase(r, k) || r[k - 1]?.t === 'script' ? base : null) : layAtom(l, r, k, path)
    put(out, b, out.w, 0)
    out.w += b.w
    out.asc = Math.max(out.asc, b.asc)
    out.desc = Math.max(out.desc, b.desc)
    if (a.t !== 'script') base = b
  }
  if (l.edit) {
    marks.push(caret(r.length, out.w))
    out.marks = [...(out.marks ?? []), ...marks]
  }
  return out
}

/** Lay a formula out at font size `size`; coordinates are relative to the left end of the baseline. */
export function typesetRows(rows: Row, size: number, edit = false, measure: Measure = measureMath): FormulaLayout {
  const box = layRow({ c: { size, comma: false, measure, script: false }, edit }, rows, [])
  const marks = box.marks ?? []
  return {
    box,
    carets: marks.filter((m) => m.kind === 'caret'),
    holes: marks.filter((m) => m.kind === 'hole'),
    ghosts: marks.filter((m) => m.kind === 'ghost')
  }
}

// ------------------------------------------------------------------ caret geometry

const samePath = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

/** Where the caret for `cur` is drawn. */
export function caretOf(lay: FormulaLayout, cur: Cursor): MathMark | undefined {
  return lay.carets.find((m) => m.i === cur.i && samePath(m.path, cur.path))
}

/** The caret position nearest to a point (same coordinates as the layout). */
export function caretAt(lay: FormulaLayout, x: number, y: number): Cursor | null {
  let best: MathMark | null = null
  let bestD = Infinity
  for (const m of lay.carets) {
    const dy = y < m.y - m.asc ? m.y - m.asc - y : y > m.y + m.desc ? y - (m.y + m.desc) : 0
    const d = Math.abs(x - m.x) + dy * 3
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best ? { path: best.path, i: best.i } : null
}

/**
 * Arrow up / down: into the slot above (-1) or below (1) in the same structure (numerator and
 * denominator, limits of a sum, cells of a matrix), trying the enclosing structures in turn.
 */
export function caretVertical(lay: FormulaLayout, cur: Cursor, dir: -1 | 1): Cursor | null {
  const from = caretOf(lay, cur)
  if (!from) return null
  const mid = (m: MathMark): number => m.y + (m.desc - m.asc) / 2
  for (let path = cur.path; path.length; path = path.slice(0, -2)) {
    const n = path.length
    let best: MathMark | null = null
    let bestD = Infinity
    for (const m of lay.carets) {
      // Sibling slots of the same atom only.
      if (m.path.length !== n || m.path[n - 1] === path[n - 1] || !samePath(m.path.slice(0, n - 1), path.slice(0, n - 1))) continue
      const dy = (mid(m) - mid(from)) * dir
      if (dy < from.asc * 0.25) continue
      const d = Math.abs(m.x - from.x) + dy * 0.5
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
    if (best) return { path: best.path, i: best.i }
  }
  return null
}

// ------------------------------------------------------------------ a formula on the board

interface Placed {
  x: number
  y: number
  size: number
  rows: Row
}

const layouts = new WeakMap<Row, Map<number, MathBox>>()

/** Layout of a board formula, remembered while its rows stay the same object (items are immutable). */
export function formulaBox(f: Pick<Placed, 'rows' | 'size'>): MathBox {
  let bySize = layouts.get(f.rows)
  if (!bySize) layouts.set(f.rows, (bySize = new Map()))
  let box = bySize.get(f.size)
  if (!box) {
    if (bySize.size > 8) bySize.clear()
    bySize.set(f.size, (box = typesetRows(f.rows, f.size).box))
  }
  return box
}

/** Position is the top-left corner of the formula, like text. */
export function formulaBBox(f: Placed): BBox {
  const b = formulaBox(f)
  return { minX: f.x, minY: f.y, maxX: f.x + Math.max(b.w, f.size * 0.3), maxY: f.y + Math.max(b.asc + b.desc, f.size * 0.6) }
}

/** A typeset formula as a display list (@inkboard/render): glyphs and the strokes of bars and roots. */
export function mathBoxDisplay(b: MathBox, x: number, baseline: number, color: string): GroupPrim {
  return {
    kind: 'group',
    fill: color,
    cap: 'round',
    join: 'round',
    children: [
      ...b.texts.map((t): Prim => ({ kind: 'text', s: t.s, x: x + t.x, y: baseline + t.y, size: t.size, family: MATH_FONT, ...(t.italic ? { italic: true } : {}) })),
      ...b.lines.map((l): Prim => ({ kind: 'polyline', pts: l.pts.map(([px, py]) => [x + px, baseline + py]), width: l.w, color }))
    ]
  }
}

export function formulaDisplay(f: Placed & { color: string }): GroupPrim {
  const b = formulaBox(f)
  return mathBoxDisplay(b, f.x, f.y + b.asc, f.color)
}

export function drawFormula(ctx: CanvasRenderingContext2D, f: Placed & { color: string }): void {
  paint(ctx, formulaDisplay(f), inkColors)
}

export function formulaSvg(f: Placed & { color: string }): string {
  return toSvg(formulaDisplay(f), inkColors)
}
