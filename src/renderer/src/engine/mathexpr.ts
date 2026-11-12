/**
 * A small, safe parser for school function formulas: `x^2`, `2x + 1`, `y = sin(x)`, `|x - 1|`, `0,5x`.
 * No `eval`: the text is tokenised and parsed by recursive descent into a tree (`MathNode`), which is
 * compiled into closures for plotting and typeset for the label next to the curve.
 *
 * Grammar (lowest to highest precedence):
 *   expr  := term (('+' | '-') term)*
 *   term  := unary (('*' | '/') unary | <implicit multiplication> power)*
 *   unary := ('-' | '+') unary | power
 *   power := primary ('^' unary)?          right-associative: 2^3^2 = 2^9, -x^2 = -(x^2)
 *   primary := number | x | pi | e | func primary-or-unary | '(' expr ')' | '|' expr '|'
 */

export type MathFn = (x: number) => number

export type ParseErrorCode = 'empty' | 'unexpected' | 'unknownName' | 'missingParen' | 'missingBar' | 'missingArg'

export type ParseResult =
  | { ok: true; fn: MathFn; node: MathNode; /** The formula was typed with a decimal comma (0,5). */ comma: boolean }
  | { ok: false; code: ParseErrorCode; pos: number; detail?: string }

/** Longest expressions we accept (file data is validated against the same cap). */
export const MAX_EXPR_LENGTH = 200

const cot = (v: number): number => 1 / Math.tan(v)

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  tg: Math.tan,
  cot,
  ctg: cot,
  asin: Math.asin,
  arcsin: Math.asin,
  acos: Math.acos,
  arccos: Math.acos,
  atan: Math.atan,
  arctan: Math.atan,
  arctg: Math.atan,
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

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/** Every name a run of letters can be split into, longest first (so `exp` wins over `e`·`x`·`p`). */
const NAMES = ['x', ...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length)

/** a^b that also takes odd roots of negative numbers: (-8)^(1/3) = -2, as taught in school. */
export function power(a: number, b: number): number {
  const r = Math.pow(a, b)
  if (!Number.isNaN(r) || a >= 0 || !Number.isFinite(b)) return r
  const inv = 1 / b
  const n = Math.round(inv)
  if (Math.abs(inv - n) < 1e-9 && Math.abs(n) % 2 === 1) return -Math.pow(-a, b)
  return r
}

type Tok =
  | { t: 'num'; v: number; text: string; pos: number }
  | { t: 'name'; v: string; pos: number }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | '|'; pos: number }
  | { t: 'end'; pos: number }

class ParseError extends Error {
  readonly code: ParseErrorCode
  readonly pos: number
  readonly detail?: string
  constructor(code: ParseErrorCode, pos: number, detail?: string) {
    super(code)
    this.code = code
    this.pos = pos
    this.detail = detail
  }
}

/** Unify notation: Unicode minus and times signs, `**`, decimal comma, π. Keeps string length. */
function normalize(src: string): string {
  return src
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[·×∙⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/(\d),(?=\d)/g, '$1.')
}

/** Drop a leading `y =` or `f(x) =` so a formula can be typed the way it is written on the board. */
function stripPrefix(src: string): { s: string; offset: number } {
  const m = /^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=/i.exec(src)
  if (!m) return { s: src, offset: 0 }
  return { s: src.slice(m[0].length), offset: m[0].length }
}

function tokenize(s: string, offset: number): Tok[] {
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
      // Split a run of letters into known names: `xsin` -> x, sin; `pix` -> pi, x.
      let j = 0
      while (j < word.length) {
        const name = NAMES.find((n) => word.startsWith(n, j))
        if (!name) throw new ParseError('unknownName', pos + j, word.slice(j))
        out.push({ t: 'name', v: name, pos: pos + j })
        j += name.length
      }
      i += word.length
      continue
    }
    if (c === '*' && s[i + 1] === '*') {
      out.push({ t: 'op', v: '^', pos })
      i += 2
      continue
    }
    if ('+-*/^()|'.includes(c)) {
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
    throw new ParseError('unexpected', pos, c)
  }
  out.push({ t: 'end', pos: s.length + offset })
  return out
}

/**
 * Expression tree. Kept close to what was typed (brackets, implicit multiplication, bracket-free function
 * arguments) so the formula can also be typeset the way the teacher wrote it (engine/mathtype.ts).
 */
export type MathNode =
  | { k: 'num'; v: number; text: string }
  | { k: 'x' }
  | { k: 'const'; name: 'pi' | 'e' }
  | { k: 'neg'; a: MathNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: MathNode; b: MathNode; implicit?: boolean }
  | { k: 'pow'; a: MathNode; b: MathNode }
  | { k: 'fn'; name: string; a: MathNode }
  | { k: 'paren'; a: MathNode }
  | { k: 'abs'; a: MathNode }

class Parser {
  private i = 0
  /** Depth of open `|…|`: inside one a `|` closes it instead of starting a new absolute value. */
  private bars = 0
  private readonly toks: Tok[]
  constructor(toks: Tok[]) {
    this.toks = toks
  }

  private peek(): Tok {
    return this.toks[this.i]
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return t.t === 'op' && t.v === v
  }
  private next(): Tok {
    return this.toks[this.i++]
  }

  parse(): MathNode {
    const n = this.expr()
    const t = this.peek()
    if (t.t !== 'end') throw new ParseError('unexpected', t.pos, t.t === 'num' ? String(t.v) : t.v)
    return n
  }

  private expr(): MathNode {
    let left = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { v: '+' | '-' }).v
      left = { k: 'bin', op, a: left, b: this.term() }
    }
    return left
  }

  /** Can the next token start a factor that is multiplied without a sign (`2x`, `x(x+1)`, `3|x|`)? */
  private startsImplicit(): boolean {
    const t = this.peek()
    if (t.t === 'num' || t.t === 'name') return true
    if (t.t === 'op' && t.v === '(') return true
    return t.t === 'op' && t.v === '|' && this.bars === 0
  }

  private term(): MathNode {
    let left = this.unary()
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.next() as { v: '*' | '/' }).v
        left = { k: 'bin', op, a: left, b: this.unary() }
      } else if (this.startsImplicit()) {
        left = { k: 'bin', op: '*', a: left, b: this.power(), implicit: true }
      } else {
        return left
      }
    }
  }

  private unary(): MathNode {
    if (this.isOp('-')) {
      this.next()
      return { k: 'neg', a: this.unary() }
    }
    if (this.isOp('+')) {
      this.next()
      return this.unary()
    }
    return this.power()
  }

  private power(): MathNode {
    const base = this.primary()
    if (!this.isOp('^')) return base
    this.next()
    return { k: 'pow', a: base, b: this.unary() }
  }

  /** Argument of a function written without brackets: a signed power times further plain factors. */
  private bareArg(): MathNode {
    let left = this.unary()
    for (;;) {
      const t = this.peek()
      const plain = t.t === 'num' || (t.t === 'name' && !(t.v in FUNCS)) || (t.t === 'op' && t.v === '(')
      if (!plain) return left
      left = { k: 'bin', op: '*', a: left, b: this.power(), implicit: true }
    }
  }

  private primary(): MathNode {
    const t = this.next()
    if (t.t === 'num') return { k: 'num', v: t.v, text: t.text }
    if (t.t === 'name') {
      if (t.v === 'x') return { k: 'x' }
      if (t.v === 'pi' || t.v === 'e') return { k: 'const', name: t.v }
      const nt = this.peek()
      if (nt.t === 'end' || (nt.t === 'op' && nt.v !== '(' && nt.v !== '|' && nt.v !== '-')) {
        throw new ParseError('missingArg', nt.pos, t.v)
      }
      // `sin(x)^2` squares the sine; without brackets the argument runs up to the next function name:
      // `sin 2x` = sin(2x), `sin x^2` = sin(x^2), `sin x cos x` = sin(x)·cos(x).
      const arg = nt.t === 'op' && nt.v === '(' ? this.primary() : this.bareArg()
      return { k: 'fn', name: t.v, a: arg }
    }
    if (t.t === 'op' && t.v === '(') {
      const saved = this.bars
      this.bars = 0
      const inner = this.expr()
      this.bars = saved
      if (!this.isOp(')')) throw new ParseError('missingParen', this.peek().pos)
      this.next()
      return { k: 'paren', a: inner }
    }
    if (t.t === 'op' && t.v === '|') {
      this.bars++
      const inner = this.expr()
      this.bars--
      if (!this.isOp('|')) throw new ParseError('missingBar', this.peek().pos)
      this.next()
      return { k: 'abs', a: inner }
    }
    if (t.t === 'end') throw new ParseError('missingArg', t.pos)
    throw new ParseError('unexpected', t.pos, t.v)
  }
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
    case 'const': {
      const v = CONSTS[n.name]
      return () => v
    }
    case 'neg': {
      const a = compile(n.a)
      return (x) => -a(x)
    }
    case 'paren':
      return compile(n.a)
    case 'abs': {
      const a = compile(n.a)
      return (x) => Math.abs(a(x))
    }
    case 'pow': {
      const a = compile(n.a)
      const b = compile(n.b)
      return (x) => power(a(x), b(x))
    }
    case 'fn': {
      const f = FUNCS[n.name]
      const a = compile(n.a)
      return (x) => f(a(x))
    }
    case 'bin': {
      const a = compile(n.a)
      const b = compile(n.b)
      if (n.op === '+') return (x) => a(x) + b(x)
      if (n.op === '-') return (x) => a(x) - b(x)
      if (n.op === '*') return (x) => a(x) * b(x)
      return (x) => a(x) / b(x)
    }
  }
}

const cache = new Map<string, ParseResult>()

/** Parse a formula of x. Results are cached by text (drawing re-reads them every frame). */
export function parseExpr(src: string): ParseResult {
  const hit = cache.get(src)
  if (hit) return hit
  let res: ParseResult
  try {
    if (src.length > MAX_EXPR_LENGTH) throw new ParseError('unexpected', MAX_EXPR_LENGTH)
    const { s, offset } = stripPrefix(normalize(src))
    if (!s.trim()) throw new ParseError('empty', offset)
    const node = new Parser(tokenize(s, offset)).parse()
    res = { ok: true, fn: compile(node), node, comma: /\d,\d/.test(src) }
  } catch (e) {
    if (!(e instanceof ParseError)) throw e
    res = { ok: false, code: e.code, pos: e.pos, ...(e.detail ? { detail: e.detail } : {}) }
  }
  if (cache.size > 500) cache.clear()
  cache.set(src, res)
  return res
}
