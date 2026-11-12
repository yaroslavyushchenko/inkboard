import type { MathNode } from './mathexpr'

/**
 * A tiny math typesetter: lays out a parsed formula (engine/mathexpr.ts) the way it is written in a
 * school textbook (italic x, raised exponents, stacked fractions, radical signs) as vector primitives:
 * text pieces and stroked polylines. The board canvas, PNG, SVG and PDF all draw the same primitives.
 * Coordinates are relative to the left end of the baseline; y grows downwards (as on the board).
 */

export const MATH_FONT = '"Times New Roman", "Liberation Serif", "DejaVu Serif", Georgia, serif'

export interface MathText {
  x: number
  y: number
  s: string
  size: number
  italic: boolean
}

export interface MathBox {
  w: number
  /** Height above the baseline. */
  asc: number
  /** Depth below the baseline. */
  desc: number
  texts: MathText[]
  /** Fraction bars, radical signs, tall brackets (stroked, width in `w` of each line). */
  lines: { pts: [number, number][]; w: number }[]
}

export type Measure = (s: string, size: number, italic: boolean) => number

let measureCtx: OffscreenCanvasRenderingContext2D | null = null
const widths = new Map<string, number>()

/** Text width with the math font; a rough estimate where no canvas exists (unit tests). */
export const measureMath: Measure = (s, size, italic) => {
  const key = `${italic ? 'i' : 'r'}${s}`
  let w = widths.get(key)
  if (w === undefined) {
    if (typeof OffscreenCanvas === 'undefined') return s.length * size * 0.5
    measureCtx ??= new OffscreenCanvas(1, 1).getContext('2d')!
    measureCtx.font = `${italic ? 'italic ' : ''}100px ${MATH_FONT}`
    w = measureCtx.measureText(s).width / 100
    if (widths.size > 2000) widths.clear()
    widths.set(key, w)
  }
  return w * size
}

const empty = (w = 0): MathBox => ({ w, asc: 0, desc: 0, texts: [], lines: [] })

/** Copy `b` into `into`, moved by (dx, dy). */
function put(into: MathBox, b: MathBox, dx: number, dy: number): void {
  for (const t of b.texts) into.texts.push({ ...t, x: t.x + dx, y: t.y + dy })
  for (const l of b.lines) into.lines.push({ w: l.w, pts: l.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) })
}

function row(parts: MathBox[]): MathBox {
  const out = empty()
  for (const p of parts) {
    put(out, p, out.w, 0)
    out.w += p.w
    out.asc = Math.max(out.asc, p.asc)
    out.desc = Math.max(out.desc, p.desc)
  }
  return out
}

interface Ctx {
  size: number
  comma: boolean
  measure: Measure
  /** Inside an exponent: fractions stay on one line. */
  script: boolean
}

function text(c: Ctx, s: string, italic: boolean): MathBox {
  return { w: c.measure(s, c.size, italic), asc: c.size * 0.7, desc: c.size * 0.2, texts: [{ x: 0, y: 0, s, size: c.size, italic }], lines: [] }
}

const strip = (n: MathNode): MathNode => (n.k === 'paren' ? n.a : n)
const rule = (c: Ctx): number => Math.max(c.size * 0.065, 0.6)

/** Does the typeset node start with a digit (then `2 * 3` needs a visible dot)? */
function startsWithNumber(n: MathNode): boolean {
  if (n.k === 'num') return true
  if (n.k === 'bin' || n.k === 'pow') return startsWithNumber(n.a)
  return false
}

function sup(c: Ctx, base: MathBox, expNode: MathNode): MathBox {
  const e = layout(strip(expNode), { ...c, size: c.size * 0.68, script: true })
  const raise = Math.max(c.size * 0.42, base.asc - e.asc * 0.55)
  const out = row([base])
  put(out, e, base.w + c.size * 0.04, -raise)
  out.w = base.w + c.size * 0.04 + e.w
  out.asc = Math.max(base.asc, raise + e.asc)
  out.desc = Math.max(base.desc, e.desc - raise)
  return out
}

function frac(c: Ctx, num: MathBox, den: MathBox): MathBox {
  const axis = c.size * 0.27
  const gap = c.size * 0.14
  const pad = c.size * 0.1
  const w = Math.max(num.w, den.w) + pad * 2
  const out = empty(w)
  const nb = -(axis + gap + num.desc)
  const db = -axis + gap + den.asc
  put(out, num, (w - num.w) / 2, nb)
  put(out, den, (w - den.w) / 2, db)
  out.lines.push({ w: rule(c), pts: [[pad * 0.5, -axis], [w - pad * 0.5, -axis]] })
  out.asc = axis + gap + num.desc + num.asc
  out.desc = db + den.desc
  return out
}

function radical(c: Ctx, inner: MathBox, index?: string): MathBox {
  const s = c.size
  const gap = s * 0.12
  const top = inner.asc + gap
  const bottom = Math.max(inner.desc, s * 0.15)
  const x0 = index ? s * 0.22 : 0
  const left = x0 + s * 0.62
  const out = empty(left + inner.w + s * 0.1)
  out.lines.push({
    w: rule(c),
    pts: [
      [x0, -s * 0.28],
      [x0 + s * 0.13, -s * 0.36],
      [x0 + s * 0.32, bottom],
      [x0 + s * 0.56, -top],
      [left + inner.w + s * 0.06, -top]
    ]
  })
  if (index) out.texts.push({ x: 0, y: -s * 0.5, s: index, size: s * 0.5, italic: false })
  put(out, inner, left, 0)
  out.asc = top + rule(c)
  out.desc = bottom
  return out
}

/** `(…)` or `|…|` around a box; drawn as strokes when the content is taller than a line of text. */
function fence(c: Ctx, inner: MathBox, kind: 'paren' | 'bar'): MathBox {
  const s = c.size
  const tall = inner.asc > s * 0.8 || inner.desc > s * 0.3
  if (kind === 'paren' && !tall) return row([text(c, '(', false), inner, text(c, ')', false)])
  const top = Math.max(inner.asc, s * 0.72) + s * 0.06
  const bot = Math.max(inner.desc, s * 0.2) + s * 0.06
  const fw = kind === 'paren' ? s * 0.32 : s * 0.22
  const out = empty(fw * 2 + inner.w)
  if (kind === 'bar') {
    out.lines.push({ w: rule(c), pts: [[fw * 0.5, -top], [fw * 0.5, bot]] })
    out.lines.push({ w: rule(c), pts: [[fw * 1.5 + inner.w, -top], [fw * 1.5 + inner.w, bot]] })
  } else {
    // Quadratic arcs: ends near the inner side, bulge outwards at mid-height.
    const arc = (xEnd: number, xMid: number): [number, number][] => {
      const pts: [number, number][] = []
      for (let i = 0; i <= 10; i++) {
        const t = i / 10
        const x = (1 - t) * (1 - t) * xEnd + 2 * t * (1 - t) * xMid + t * t * xEnd
        pts.push([x, -top + (top + bot) * t])
      }
      return pts
    }
    out.lines.push({ w: rule(c), pts: arc(fw * 0.85, -fw * 0.25) })
    const r = fw + inner.w
    out.lines.push({ w: rule(c), pts: arc(r + fw * 0.15, r + fw * 1.25) })
  }
  put(out, inner, fw, 0)
  out.asc = top
  out.desc = bot
  return out
}

function layout(n: MathNode, c: Ctx): MathBox {
  const s = c.size
  switch (n.k) {
    case 'num':
      return text(c, c.comma ? n.text.replace('.', ',') : n.text, false)
    case 'x':
      return text(c, 'x', true)
    case 'const':
      return n.name === 'pi' ? text(c, 'π', false) : text(c, 'e', true)
    case 'neg':
      return row([text(c, '−', false), empty(s * 0.04), layout(n.a, c)])
    case 'paren':
      return fence(c, layout(n.a, c), 'paren')
    case 'abs':
      return fence(c, layout(n.a, c), 'bar')
    case 'pow':
      return sup(c, layout(n.a, c), n.b)
    case 'fn': {
      if (n.name === 'sqrt') return radical(c, layout(strip(n.a), c))
      if (n.name === 'cbrt') return radical(c, layout(strip(n.a), c), '3')
      if (n.name === 'abs') return fence(c, layout(strip(n.a), c), 'bar')
      if (n.name === 'exp') return sup(c, text(c, 'e', true), n.a)
      return row([text(c, n.name, false), empty(n.a.k === 'paren' ? s * 0.04 : s * 0.16), layout(n.a, c)])
    }
    case 'bin': {
      if (n.op === '+' || n.op === '-') {
        const gap = empty(s * (c.script ? 0.12 : 0.22))
        return row([layout(n.a, c), gap, text(c, n.op === '+' ? '+' : '−', false), gap, layout(n.b, c)])
      }
      if (n.op === '/') {
        if (c.script) return row([layout(n.a, c), text(c, '/', false), layout(n.b, c)])
        return frac(c, layout(strip(n.a), c), layout(strip(n.b), c))
      }
      // Multiplication: written side by side (2x, x(x+1)) unless two numbers meet (2·3).
      const a = layout(n.a, c)
      const b = layout(n.b, c)
      if (startsWithNumber(n.b)) return row([a, empty(s * 0.14), text(c, '·', false), empty(s * 0.14), b])
      const fnNext = n.b.k === 'fn' && n.b.name !== 'sqrt' && n.b.name !== 'cbrt' && n.b.name !== 'abs' && n.b.name !== 'exp'
      const fnBefore = n.a.k === 'fn' && n.a.a.k !== 'paren'
      return row([a, empty(fnNext || fnBefore ? s * 0.16 : s * 0.03), b])
    }
  }
}

/** Typeset `y = <formula>` at font size `size`. */
export function typesetFormula(node: MathNode, size: number, comma = false, measure: Measure = measureMath): MathBox {
  const c: Ctx = { size, comma, measure, script: false }
  return row([text(c, 'y', true), empty(size * 0.25), text(c, '=', false), empty(size * 0.25), layout(node, c)])
}
