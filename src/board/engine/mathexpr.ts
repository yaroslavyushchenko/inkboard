/**
 * A small, safe calculator for school formulas. No `eval`: a formula is lexed into tokens
 * (engine/mathlex.ts for typed text such as `x^2`, `2x + 1`, `y = sin(x)`, `|x - 1|`, `0,5x`;
 * engine/formulalex.ts for formulas built on the math keypad), parsed into a tree
 * (engine/mathparse.ts), and the tree is compiled here into closures for plotting and evaluated for
 * plain numbers. The tree is also typeset for the label next to a curve (engine/mathtype.ts).
 */
import { CONSTS, FUNCS, normalize, ParseError, stripPrefix, tokenize, type ParseErrorCode, type TokAt } from './mathlex'
import { Parser, type MathNode } from './mathparse'

export type { ParseErrorCode } from './mathlex'
export type { MathNode } from './mathparse'

/** A formula as a closure; `y` is only read by equations in x and y. */
export type MathFn = (x: number, y?: number) => number

export type ParseResult =
  | {
      ok: true
      fn: MathFn
      node: MathNode
      /** The formula was typed with a decimal comma (0,5). */
      comma: boolean
      /** An equation in x and y (x² + y² = 4): its two sides; `fn` is their difference, drawn where it is 0. */
      eq?: [MathNode, MathNode]
    }
  | { ok: false; code: ParseErrorCode; pos: number; detail?: string; /** Keypad formulas: the place to point at. */ at?: TokAt }

/** Longest expressions we accept (file data is validated against the same cap). */
export const MAX_EXPR_LENGTH = 200

/** a^b that also takes odd roots of negative numbers: (-8)^(1/3) = -2, as taught in school. */
export function power(a: number, b: number): number {
  const r = Math.pow(a, b)
  if (!Number.isNaN(r) || a >= 0 || !Number.isFinite(b)) return r
  const inv = 1 / b
  const n = Math.round(inv)
  if (Math.abs(inv - n) < 1e-9 && Math.abs(n) % 2 === 1) return -Math.pow(-a, b)
  return r
}

/** n! for whole n from 0 to 170 (beyond that a double overflows). */
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/** Number of ways to pick r of n: unordered (C) or in order (P, also written V or A). */
export function choose(kind: 'C' | 'P' | 'V', n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) return NaN
  let v = 1
  for (let i = 0; i < r; i++) v *= n - i
  return kind === 'C' ? Math.round(v / factorial(r)) : v
}

/** Turn the tree into a plain closure (evaluated thousands of times per plot). */
export function compile(n: MathNode): MathFn {
  switch (n.k) {
    case 'num': {
      const v = n.v
      return () => v
    }
    case 'x':
      return (x) => x
    case 'y':
      return (_x, y) => y ?? NaN
    case 'const': {
      const v = CONSTS[n.name]
      return () => v
    }
    case 'neg': {
      const a = compile(n.a)
      return (x, y) => -a(x, y)
    }
    case 'paren':
      return compile(n.a)
    case 'abs': {
      const a = compile(n.a)
      return (x, y) => Math.abs(a(x, y))
    }
    case 'pow': {
      const a = compile(n.a)
      const b = compile(n.b)
      return (x, y) => power(a(x, y), b(x, y))
    }
    case 'fn': {
      const f = FUNCS[n.name]
      const a = compile(n.a)
      return (x, y) => f(a(x, y))
    }
    case 'post': {
      const a = compile(n.a)
      if (n.op === '!') return (x, y) => factorial(a(x, y))
      if (n.op === '%') return (x, y) => a(x, y) / 100
      return (x, y) => (a(x, y) * Math.PI) / 180
    }
    case 'root': {
      const a = compile(n.a)
      const i = compile(n.index)
      return (x, y) => power(a(x, y), 1 / i(x, y))
    }
    case 'log': {
      const a = compile(n.a)
      const b = compile(n.base)
      return (x, y) => Math.log(a(x, y)) / Math.log(b(x, y))
    }
    case 'comb': {
      const a = compile(n.n)
      const b = compile(n.r)
      const kind = n.kind
      return (x, y) => choose(kind, a(x, y), b(x, y))
    }
    case 'bin': {
      const a = compile(n.a)
      const b = compile(n.b)
      if (n.op === '+') return (x, y) => a(x, y) + b(x, y)
      if (n.op === '-') return (x, y) => a(x, y) - b(x, y)
      if (n.op === '*') return (x, y) => a(x, y) * b(x, y)
      return (x, y) => a(x, y) / b(x, y)
    }
  }
}

/** Does the formula depend on x? */
export function usesX(n: MathNode): boolean {
  switch (n.k) {
    case 'num':
    case 'const':
      return false
    case 'x':
      return true
    case 'y':
      return false
    case 'neg':
    case 'paren':
    case 'abs':
    case 'fn':
    case 'post':
      return usesX(n.a)
    case 'pow':
    case 'bin':
      return usesX(n.a) || usesX(n.b)
    case 'root':
      return usesX(n.a) || usesX(n.index)
    case 'log':
      return usesX(n.a) || usesX(n.base)
    case 'comb':
      return usesX(n.n) || usesX(n.r)
  }
}

/** Does the formula use the y of an equation in x and y? */
export function usesY(n: MathNode): boolean {
  switch (n.k) {
    case 'y':
      return true
    case 'num':
    case 'const':
    case 'x':
      return false
    case 'neg':
    case 'paren':
    case 'abs':
    case 'fn':
    case 'post':
      return usesY(n.a)
    case 'pow':
    case 'bin':
      return usesY(n.a) || usesY(n.b)
    case 'root':
      return usesY(n.a) || usesY(n.index)
    case 'log':
      return usesY(n.a) || usesY(n.base)
    case 'comb':
      return usesY(n.n) || usesY(n.r)
  }
}

/** The value of a formula without x, or null when it has an x or no finite value (1/0, √−1). */
export function evaluate(n: MathNode): number | null {
  if (usesX(n) || usesY(n)) return null
  const v = compile(n)(NaN)
  return Number.isFinite(v) ? v : null
}

/** Shared ending of every parse: tokens to a result, parse errors to a failed result. */
export function parseWith(lex: () => { toks: ReturnType<typeof tokenize>; comma: boolean }): ParseResult {
  try {
    const { toks, comma } = lex()
    const node = new Parser(toks).parse()
    return { ok: true, fn: compile(node), node, comma }
  } catch (e) {
    if (!(e instanceof ParseError)) throw e
    return { ok: false, code: e.code, pos: e.pos, ...(e.detail ? { detail: e.detail } : {}), ...(e.at ? { at: e.at } : {}) }
  }
}

const cache = new Map<string, ParseResult>()

/** Parse a typed formula of x. Results are cached by text (drawing re-reads them every frame). */
export function parseExpr(src: string): ParseResult {
  const hit = cache.get(src)
  if (hit) return hit
  const res = parseWith(() => {
    if (src.length > MAX_EXPR_LENGTH) throw new ParseError('unexpected', MAX_EXPR_LENGTH)
    const { s, offset } = stripPrefix(normalize(src))
    if (!s.trim()) throw new ParseError('empty', offset)
    return { toks: tokenize(s, offset), comma: /\d,\d/.test(src) }
  })
  if (cache.size > 500) cache.clear()
  cache.set(src, res)
  return res
}
