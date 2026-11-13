/**
 * What a keypad formula (engine/formula.ts) means as a calculation: parsing it for a plot, working
 * out the number it stands for, and the two conversions that connect it with formulas typed as text
 * (old boards, older versions of the app).
 */
import type { Atom, Row } from '@inkboard/math/formula'
import { slots, validateRows, withSlots } from '@inkboard/math/formula'
import { parseRow, type LexInfo } from '@inkboard/math/formulalex'
import { evaluate, parseExpr, parseWith, usesX, usesY, type MathNode, type ParseResult } from '@inkboard/math/mathexpr'
import type { PlotFn } from '@inkboard/core/types'

const c = (s: string): Atom => ({ t: 'c', s })
const isC = (a: Atom | undefined, s: string): boolean => !!a && a.t === 'c' && a.s === s

/** Variables a plotted function can be written in. */
export const FN_VARS = ['x', 't', 'a', 'n', 'k', 'φ'] as const
/** Names a plotted function can carry (y = …, f(x) = …, s(t) = …). */
export const FN_NAMES = ['y', 'f', 'g', 'h', 's', 'v'] as const

/** A letter that can name a function or be its variable (not e, which is a number). */
export const isFnLetter = (s: unknown): s is string => typeof s === 'string' && /^\p{Ll}$/u.test(s) && s !== 'e' && s !== 'π'

/** What a leading `y =`, `f(x) =` or `s(t) =` says; it is not part of the formula itself. */
export interface PlotHead {
  /** Atoms the head takes (0 = none). */
  len: number
  name?: string
  arg?: string
}

export function plotHead(rows: Row): PlotHead {
  const f = rows[0]
  if (f?.t !== 'c' || !isFnLetter(f.s) || f.s === 'x') return { len: 0 }
  if (isC(rows[1], '=')) return { len: 2, name: f.s }
  const arg = rows[1]
  if (arg?.t === 'fence' && arg.k === 'paren' && arg.x.length === 1 && arg.x[0].t === 'c' && isFnLetter(arg.x[0].s) && arg.x[0].s !== f.s && isC(rows[2], '=')) {
    return { len: 3, name: f.s, arg: arg.x[0].s }
  }
  return { len: 0 }
}

/** Length of a leading `y =` or `f(x) =`, which is not part of the formula itself. */
export const prefixLength = (rows: Row): number => plotHead(rows).len

/**
 * Where the `=` of an equation in x and y stands (x² + y² = 4, x = 3, y² = x), or -1. A leading
 * `y =` or `f(x) =` makes a function instead, and a formula ending in `=` asks for its value.
 */
export function equalsAt(rows: Row): number {
  if (plotHead(rows).len) return -1
  const i = rows.findIndex((a) => isC(a, '='))
  return i > 0 && i < rows.length - 1 ? i : -1
}

/** Is the formula an equation in x and y, drawn as a curve where both sides are equal? */
export const isEquation = (rows: Row): boolean => equalsAt(rows) >= 0

const parsed = new WeakMap<Row, Map<string, ParseResult>>()

/**
 * Parse a keypad formula as a function of `arg` (x unless set; a head like `s(t) =` names its own),
 * or as an equation in `arg` and y. Cached while the rows stay the same object (formulas are immutable).
 */
export function parseRows(rows: Row, arg = 'x'): ParseResult {
  const head = plotHead(rows)
  const v = head.arg ?? arg
  let byArg = parsed.get(rows)
  if (!byArg) parsed.set(rows, (byArg = new Map()))
  let res = byArg.get(v)
  if (!res) {
    const eq = equalsAt(rows)
    let sides: [MathNode, MathNode] | undefined
    res = parseWith(() => {
      const info: LexInfo = { comma: false, arg: v }
      let node: MathNode
      if (eq < 0) node = parseRow(rows, [], info, head.len)
      else {
        info.y = true
        sides = [parseRow(rows, [], info, 0, eq), parseRow(rows, [], info, eq + 1)]
        node = { k: 'bin', op: '-', a: sides[0], b: sides[1] }
      }
      return { toks: [{ t: 'node', node, pos: 0 }, { t: 'end', pos: 0 }], comma: info.comma }
    })
    if (res.ok && sides) res = { ...res, eq: sides }
    byArg.set(v, res)
  }
  return res
}

/** The name and variable a plotted function is shown with: its own head first, then its settings. */
export function fnHead(f: Pick<PlotFn, 'rows' | 'name' | 'arg'>): { name: string; arg: string } {
  const head = f.rows ? plotHead(f.rows) : { len: 0 }
  // An equation names no function: its curve lives in the plane of x (or its variable) and y.
  if (f.rows && isEquation(f.rows)) return { name: 'y', arg: f.arg ?? 'x' }
  return { name: head.name ?? f.name ?? 'y', arg: head.arg ?? f.arg ?? 'x' }
}

/** The left side written before a plotted formula: `y =`, `f(x) =`, `s(t) =`. */
export function headRows(name: string, arg: string): Row {
  if (name === 'y') return [c('y'), c('=')]
  return [c(name), { t: 'fence', k: 'paren', x: [c(arg)] }, c('=')]
}

/** The formula written next to a plotted curve, with its left side. */
export function labelRows(f: PlotFn & { rows: Row }): Row {
  if (plotHead(f.rows).len || isEquation(f.rows)) return f.rows
  const { name, arg } = fnHead(f)
  return [...headRows(name, arg), ...f.rows]
}

/**
 * The formula with its variable renamed (x² + x → t² + t), so picking another variable keeps it valid.
 * Only letters standing alone are renamed: the x inside a typed name like `exp` is left as it is.
 */
export function renameVar(rows: Row, from: string, to: string): Row {
  const letter = (a: Atom | undefined): boolean => !!a && a.t === 'c' && /^[a-z]$/i.test(a.s)
  let changed = false
  const out = rows.map((a, i) => {
    if (a.t === 'c') {
      if (a.s !== from || letter(rows[i - 1]) || letter(rows[i + 1])) return a
      changed = true
      return c(to)
    }
    const kids = slots(a)
    if (!kids.length) return a
    const next = kids.map((r) => renameVar(r, from, to))
    if (next.every((r, k) => r === kids[k])) return a
    changed = true
    return withSlots(a, next)
  })
  return changed ? out : rows
}

/**
 * A formula from the board read as a function to plot: its variable comes from its head
 * (`s(t) =`), else it is x, else the one letter it uses (`3t + 1`). Null when it is no function.
 */
export function plotFormula(rows: Row): { arg: string; name?: string } | null {
  const head = plotHead(rows)
  const named = head.name ? { name: head.name } : {}
  // Something to draw: a curve in the variable, or an equation that also uses y (y² = 4).
  const draws = (r: ParseResult): boolean => r.ok && (usesX(r.node) || (!!r.eq && usesY(r.node)))
  if (head.arg) return parseRows(rows, head.arg).ok ? { arg: head.arg, ...named } : null
  const r = parseRows(rows, 'x')
  if (r.ok) return draws(r) || head.len ? { arg: 'x', ...named } : null
  const v = r.detail
  if (r.code === 'unknownName' && isFnLetter(v) && v !== head.name && v !== 'y') {
    const again = parseRows(rows, v)
    if (again.ok && usesX(again.node)) return { arg: v, ...named }
  }
  return null
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
    case 'y':
      return [c('y')]
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
    case 'y':
      return 'y'
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
export function rowsToText(rows: Row, arg = 'x'): string {
  const r = parseRows(rows, arg)
  if (!r.ok) return ''
  return r.eq ? `${nodeToText(r.eq[0])}=${nodeToText(r.eq[1])}` : nodeToText(r.node)
}

/** Parse one plotted function: its keypad formula when it has one, else its text. */
export function parsePlot(f: PlotFn): ParseResult {
  return f.rows ? parseRows(f.rows, f.arg) : parseExpr(f.expr)
}

/**
 * Keypad rows read from a file, kept only if they still say the same as the text next to them
 * (an older version may have edited the text and left the rows behind).
 */
export function readPlotRows(v: unknown, expr: string, arg = 'x'): Row | null {
  const rows = validateRows(v)
  return rows && rows.length && rowsToText(rows, arg) === expr ? rows : null
}
