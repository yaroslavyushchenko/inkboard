/**
 * Lexing for school formulas: the token type shared by every lexer, and the lexer for typed text
 * (`x^2`, `2x + 1`, `y = sin(x)`, `|x - 1|`, `0,5x`). The other lexer reads a formula built on the
 * math keypad (engine/formulalex.ts). Both feed the one parser in engine/mathparse.ts.
 */
import type { MathNode } from './mathparse'

export type ParseErrorCode = 'empty' | 'unexpected' | 'unknownName' | 'missingParen' | 'missingBar' | 'missingArg' | 'unsupported'

/** Where a token came from in a keypad formula: a caret position (engine/formula.ts Cursor). */
export interface TokAt {
  path: number[]
  i: number
}

interface TokBase {
  /** Index in the typed text (0 for keypad formulas, which use `at`). */
  pos: number
  at?: TokAt
}

export type Tok = TokBase &
  (
    | { t: 'num'; v: number; text: string }
    /** `exp` / `base`: a power or a base written right on the name (sin², log₂). Keypad formulas only. */
    | { t: 'name'; v: string; exp?: MathNode; base?: MathNode }
    | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | '|' | '!' | '%' | '°' }
    /** `=`, `<`, `≥` …: recognised so the error can name them; formulas of x have no relations. */
    | { t: 'rel'; v: string }
    /** A part that is already a finished tree: a stacked fraction, a root, a bracketed group. */
    | { t: 'node'; node: MathNode }
    /** A raised exponent attached to whatever stands before it. */
    | { t: 'sup'; node: MathNode }
    | { t: 'end' }
  )

export class ParseError extends Error {
  readonly code: ParseErrorCode
  readonly pos: number
  readonly detail?: string
  readonly at?: TokAt
  constructor(code: ParseErrorCode, pos: number, detail?: string, at?: TokAt) {
    super(code)
    this.code = code
    this.pos = pos
    this.detail = detail
    this.at = at
  }
}

const cot = (v: number): number => 1 / Math.tan(v)
const acot = (v: number): number => Math.PI / 2 - Math.atan(v)

export const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  tg: Math.tan,
  cot,
  ctg: cot,
  sec: (v) => 1 / Math.cos(v),
  csc: (v) => 1 / Math.sin(v),
  asin: Math.asin,
  arcsin: Math.asin,
  acos: Math.acos,
  arccos: Math.acos,
  atan: Math.atan,
  arctan: Math.atan,
  arctg: Math.atan,
  acot,
  arccot: acot,
  arcctg: acot,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  coth: (v) => 1 / Math.tanh(v),
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  log: Math.log10,
  lg: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  sign: Math.sign,
  sgn: Math.sign
}

export const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/** Every name a run of letters can be split into, longest first (so `exp` wins over `e`·`x`·`p`). */
export const NAMES = ['x', ...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length)

const namesByVar = new Map<string, readonly string[]>([['x', NAMES]])
/**
 * The names a run of letters can hold when the function's variable is `v` (t, a, φ… instead of x):
 * `v` takes the place of x, and x becomes an unknown letter. An equation in x and y (`withY`) also
 * knows y.
 */
export function namesFor(v: string, withY = false): readonly string[] {
  const key = withY ? `${v} y` : v
  let names = namesByVar.get(key)
  if (!names) {
    const own = [...(/^[a-z]$/.test(v) ? [v] : []), ...(withY ? ['y'] : [])]
    names = [...NAMES.filter((n) => n !== 'x'), ...own].sort((a, b) => b.length - a.length)
    namesByVar.set(key, names)
  }
  return names
}

/** Split a run of letters into known names: `xsin` -> x, sin; `pix` -> pi, x. */
export function splitNames(word: string, fail: (offset: number, rest: string) => never, names: readonly string[] = NAMES): { name: string; offset: number }[] {
  const out: { name: string; offset: number }[] = []
  let j = 0
  while (j < word.length) {
    const name = names.find((n) => word.startsWith(n, j))
    if (!name) fail(j, word.slice(j))
    out.push({ name: name!, offset: j })
    j += name!.length
  }
  return out
}

/** Unify notation: Unicode minus and times signs, `**`, decimal comma, π. Keeps string length. */
export function normalize(src: string): string {
  return src
    .replace(/[−–—]/g, '-')
    .replace(/[·×∙⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/(\d),(?=\d)/g, '$1.')
}

/** Drop a leading `y =` or `f(x) =` so a formula can be typed the way it is written on the board. */
export function stripPrefix(src: string): { s: string; offset: number } {
  const m = /^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=/i.exec(src)
  if (!m) return { s: src, offset: 0 }
  return { s: src.slice(m[0].length), offset: m[0].length }
}

export const RELATIONS = '=<>≤≥≠≈'

export function tokenize(s: string, offset: number): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const pos = i + offset
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i))
      if (!m) throw new ParseError('unexpected', pos, c)
      out.push({ t: 'num', v: Number(m[0]), text: m[0], pos })
      i += m[0].length
      continue
    }
    if (c === 'π') {
      out.push({ t: 'name', v: 'pi', pos })
      i++
      continue
    }
    if (/[a-z]/i.test(c)) {
      const word = /^[a-z]+/i.exec(s.slice(i))![0].toLowerCase()
      for (const n of splitNames(word, (j, rest) => {
        throw new ParseError('unknownName', pos + j, rest)
      })) {
        out.push({ t: 'name', v: n.name, pos: pos + n.offset })
      }
      i += word.length
      continue
    }
    if (c === '*' && s[i + 1] === '*') {
      out.push({ t: 'op', v: '^', pos })
      i += 2
      continue
    }
    if ('+-*/^()|!%°'.includes(c)) {
      out.push({ t: 'op', v: c as '+', pos })
      i++
      continue
    }
    if (c === '[' || c === '{') {
      out.push({ t: 'op', v: '(', pos })
      i++
      continue
    }
    if (c === ']' || c === '}') {
      out.push({ t: 'op', v: ')', pos })
      i++
      continue
    }
    if (RELATIONS.includes(c)) {
      out.push({ t: 'rel', v: c, pos })
      i++
      continue
    }
    throw new ParseError('unexpected', pos, c)
  }
  out.push({ t: 'end', pos: s.length + offset })
  return out
}
