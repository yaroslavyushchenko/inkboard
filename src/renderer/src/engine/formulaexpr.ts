/**
 * What a keypad formula (engine/formula.ts) means as a calculation: parsing it for a plot, working
 * out the number it stands for, and the two conversions that connect it with formulas typed as text
 * (old boards, older versions of the app).
 */
import type { Atom, Row } from './formula'
import { validateRows } from './formula'
import { parseRow, type LexInfo } from './formulalex'
import { evaluate, parseExpr, parseWith, type MathNode, type ParseResult } from './mathexpr'
import type { PlotFn } from './types'

const c = (s: string): Atom => ({ t: 'c', s })
const isC = (a: Atom | undefined, s: string): boolean => !!a && a.t === 'c' && a.s === s

/** Length of a leading `y =` or `f(x) =`, which is not part of the formula itself. */
function prefixLength(rows: Row): number {
  if (isC(rows[0], 'y') && isC(rows[1], '=')) return 2
  const f = rows[0]
  const arg = rows[1]
  if (f?.t === 'c' && /^[a-z]$/.test(f.s) && arg?.t === 'fence' && arg.k === 'paren' && arg.x.length === 1 && isC(arg.x[0], 'x') && isC(rows[2], '=')) return 3
  return 0
}

const parsed = new WeakMap<Row, ParseResult>()

/** Parse a keypad formula of x. Cached while the rows stay the same object (formulas are immutable). */
export function parseRows(rows: Row): ParseResult {
  let res = parsed.get(rows)
  if (!res) {
    res = parseWith(() => {
      const info: LexInfo = { comma: false }
      const node = parseRow(rows, [], info, prefixLength(rows))
      return { toks: [{ t: 'node', node, pos: 0 }, { t: 'end', pos: 0 }], comma: info.comma }
    })
    parsed.set(rows, res)
  }
  return res
}

// ------------------------------------------------------------------ the number a formula stands for

export interface NumericResult {
  value: number
  /** Shown with ≈: the digits were rounded. */
  approx: boolean
  /** The value as atoms, ready to be put after an `=`. */
  atoms: Atom[]
  /** The formula already ends with `=`. */
  hasEq: boolean
}

/** A number as it is written in the formula: 3,5 or 1,2·10⁸, with a real minus sign. */
export function numberAtoms(value: number, comma: boolean): { atoms: Atom[]; approx: boolean } {
  const exact = Number.isInteger(value) && Math.abs(value) < 1e15
  const shown = exact ? value : Number(value.toPrecision(8))
  const approx = !exact && shown !== Number(value.toPrecision(13))
  const big = shown !== 0 && !exact && (Math.abs(shown) >= 1e15 || Math.abs(shown) < 1e-6)
  const m = /^(-?)([\d.]+)(?:e([+-]?)(\d+))?$/.exec(big ? shown.toExponential() : String(shown))
  if (!m) return { atoms: [], approx }
  const atoms: Atom[] = []
  if (m[1]) atoms.push(c('−'))
  for (const ch of m[2]) atoms.push(c(ch === '.' && comma ? ',' : ch))
  if (m[4]) {
    const exp: Row = [...(m[3] === '-' ? [c('−')] : []), ...[...m[4]].map(c)]
    atoms.push(c('·'), c('1'), c('0'), { t: 'script', sup: exp })
  }
  return { atoms, approx }
}

/**
 * The value of a formula that is plain arithmetic (no x, nothing left open), or null. A formula that
 * is only a number has no result worth showing; one that ends with `=` is asking for it.
 */
export function numericResult(rows: Row, comma = false): NumericResult | null {
  const hasEq = isC(rows[rows.length - 1], '=')
  const end = hasEq ? rows.length - 1 : rows.length
  if (end <= 0) return null
  const info: LexInfo = { comma: false }
  const res = parseWith(() => ({ toks: [{ t: 'node', node: parseRow(rows, [], info, 0, end), pos: 0 }, { t: 'end', pos: 0 }], comma: false }))
  if (!res.ok) return null
  const plain = res.node.k === 'num' || (res.node.k === 'neg' && res.node.a.k === 'num')
  if (plain && !hasEq) return null
  const value = evaluate(res.node)
  if (value === null) return null
  return { value, hasEq, ...numberAtoms(value, comma || info.comma) }
}

// ------------------------------------------------------------------ text formulas <-> keypad formulas

const strip = (n: MathNode): MathNode => (n.k === 'paren' ? n.a : n)

/** A formula parsed from text as a keypad formula, so a function typed long ago opens in the new field. */
export function nodeToRows(n: MathNode, comma = false): Row {
  const go = (m: MathNode): Row => nodeToRows(m, comma)
  switch (n.k) {
    case 'num':
      return [...(comma ? n.text.replace('.', ',') : n.text)].map(c)
    case 'x':
      return [c('x')]
    case 'const':
      return [c(n.name === 'pi' ? 'π' : 'e')]
    case 'neg':
      return [c('−'), ...go(n.a)]
    case 'paren':
      return [{ t: 'fence', k: 'paren', x: go(n.a) }]
    case 'abs':
      return [{ t: 'fence', k: 'bar', x: go(n.a) }]
    case 'pow':
      return [...go(n.a), { t: 'script', sup: go(strip(n.b)) }]
    case 'post':
      return [...go(n.a), c(n.op)]
    case 'root':
      return [{ t: 'root', x: go(strip(n.a)), i: go(strip(n.index)) }]
    case 'log':
      return [{ t: 'op', s: 'log' }, { t: 'script', sub: go(strip(n.base)) }, ...go(n.a)]
    case 'comb':
      return [{ t: 'comb', s: n.kind, n: go(strip(n.n)), k: go(strip(n.r)) }]
    case 'fn':
      if (n.name === 'sqrt') return [{ t: 'root', x: go(strip(n.a)) }]
      if (n.name === 'cbrt') return [{ t: 'root', x: go(strip(n.a)), i: [c('3')] }]
      if (n.name === 'abs') return [{ t: 'fence', k: 'bar', x: go(strip(n.a)) }]
      if (n.name === 'exp') return [c('e'), { t: 'script', sup: go(strip(n.a)) }]
      return [{ t: 'op', s: n.name }, ...go(n.a)]
    case 'bin':
      if (n.op === '/') return [{ t: 'frac', n: go(strip(n.a)), d: go(strip(n.b)) }]
      if (n.op === '*') return n.implicit ? [...go(n.a), ...go(n.b)] : [...go(n.a), c('·'), ...go(n.b)]
      return [...go(n.a), c(n.op === '+' ? '+' : '−'), ...go(n.b)]
  }
}

/** How tightly a node holds together: a child that binds looser than its place needs brackets. */
function prec(n: MathNode): number {
  if (n.k === 'bin') return n.op === '+' || n.op === '-' ? 1 : 2
  if (n.k === 'neg') return 3
  if (n.k === 'pow') return 4
  return 5
}

/**
 * The formula as plain text that the text parser of any version reads to the same function: what
 * older versions of Inkboard plot when they open a board made with the keypad.
 */
export function nodeToText(n: MathNode): string {
  const at = (m: MathNode, min: number): string => (prec(m) < min ? `(${nodeToText(m)})` : nodeToText(m))
  switch (n.k) {
    case 'num':
      return n.text
    case 'x':
      return 'x'
    case 'const':
      return n.name
    case 'neg':
      return `-${at(n.a, 2)}`
    case 'paren':
      return `(${nodeToText(n.a)})`
    case 'abs':
      return `abs(${nodeToText(n.a)})`
    case 'pow':
      return `${at(n.a, 5)}^${at(n.b, 5)}`
    case 'fn':
      return `${n.name}(${nodeToText(strip(n.a))})`
    case 'post':
      if (n.op === '!') return `${at(n.a, 5)}!`
      return n.op === '%' ? `(${at(n.a, 3)}/100)` : `(${at(n.a, 3)}*pi/180)`
    case 'root':
      return `(${at(n.a, 5)}^(1/${at(n.index, 5)}))`
    case 'log':
      return `(ln(${nodeToText(strip(n.a))})/ln(${nodeToText(strip(n.base))}))`
    case 'comb':
      return `n${n.kind}r(${nodeToText(n.n)};${nodeToText(n.r)})`
    case 'bin': {
      const p = prec(n)
      return `${at(n.a, p)}${n.op}${at(n.b, n.op === '-' || n.op === '/' ? p + 1 : p)}`
    }
  }
}

/** The text stored beside a keypad formula on a plot (see `nodeToText`); '' when it can't be plotted. */
export function rowsToText(rows: Row): string {
  const r = parseRows(rows)
  return r.ok ? nodeToText(r.node) : ''
}

/** Parse one plotted function: its keypad formula when it has one, else its text. */
export function parsePlot(f: PlotFn): ParseResult {
  return f.rows ? parseRows(f.rows) : parseExpr(f.expr)
}

/**
 * Keypad rows read from a file, kept only if they still say the same as the text next to them
 * (an older version may have edited the text and left the rows behind).
 */
export function readPlotRows(v: unknown, expr: string): Row | null {
  const rows = validateRows(v)
  return rows && rows.length && rowsToText(rows) === expr ? rows : null
}
