/**
 * The parser: tokens (from typed text or from a keypad formula, see engine/mathlex.ts) to an
 * expression tree, by recursive descent.
 *
 * Grammar (lowest to highest precedence):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary | <implicit multiplication> power)*
 *   unary   := ('-' | '+') unary | power
 *   power   := postfix ('^' unary)?        right-associative: 2^3^2 = 2^9, -x^2 = -(x^2)
 *   postfix := primary ('!' | '%' | '°' | <raised exponent>)*
 *   primary := number | x | y | pi | e | func primary-or-unary | '(' expr ')' | '|' expr '|' | <finished part>
 */
import { FUNCS, ParseError, type Tok } from './mathlex'

/**
 * Expression tree. Kept close to what was typed (brackets, implicit multiplication, bracket-free function
 * arguments) so the formula can also be typeset the way the teacher wrote it (engine/mathtype.ts).
 */
export type MathNode =
  | { k: 'num'; v: number; text: string }
  | { k: 'x' }
  /** The second variable of an equation in x and y (x² + y² = 4). */
  | { k: 'y' }
  | { k: 'const'; name: 'pi' | 'e' }
  | { k: 'neg'; a: MathNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: MathNode; b: MathNode; implicit?: boolean }
  | { k: 'pow'; a: MathNode; b: MathNode }
  | { k: 'fn'; name: string; a: MathNode }
  | { k: 'paren'; a: MathNode }
  | { k: 'abs'; a: MathNode }
  /** Factorial, per cent, degrees. */
  | { k: 'post'; op: '!' | '%' | '°'; a: MathNode }
  /** Root of any degree (keypad formulas; plain `sqrt` / `cbrt` stay functions). */
  | { k: 'root'; index: MathNode; a: MathNode }
  /** Logarithm with a written base. */
  | { k: 'log'; base: MathNode; a: MathNode }
  /** Combinations C, arrangements without repetition P / V (the same count, two notations). */
  | { k: 'comb'; kind: 'C' | 'P' | 'V'; n: MathNode; r: MathNode }

export class Parser {
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
  private fail(code: ConstructorParameters<typeof ParseError>[0], t: Tok, detail?: string): never {
    throw new ParseError(code, t.pos, detail, t.at)
  }

  parse(): MathNode {
    const n = this.expr()
    const t = this.peek()
    if (t.t !== 'end') this.fail('unexpected', t, describe(t))
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
    if (t.t === 'num' || t.t === 'name' || t.t === 'node') return true
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
    const base = this.postfix(this.primary())
    if (!this.isOp('^')) return base
    this.next()
    return { k: 'pow', a: base, b: this.unary() }
  }

  private postfix(n: MathNode): MathNode {
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && (t.v === '!' || t.v === '%' || t.v === '°')) {
        this.next()
        n = { k: 'post', op: t.v, a: n }
      } else if (t.t === 'sup') {
        this.next()
        n = { k: 'pow', a: n, b: t.node }
      } else {
        return n
      }
    }
  }

  /** Argument of a function written without brackets: a signed power times further plain factors. */
  private bareArg(): MathNode {
    let left = this.unary()
    for (;;) {
      const t = this.peek()
      const plain = t.t === 'num' || t.t === 'node' || (t.t === 'name' && !(t.v in FUNCS)) || (t.t === 'op' && t.v === '(')
      if (!plain) return left
      left = { k: 'bin', op: '*', a: left, b: this.power(), implicit: true }
    }
  }

  private primary(): MathNode {
    const t = this.next()
    if (t.t === 'num') return { k: 'num', v: t.v, text: t.text }
    if (t.t === 'node') return t.node
    if (t.t === 'name') {
      if (t.v === 'x') return { k: 'x' }
      if (t.v === 'y') return { k: 'y' }
      if (t.v === 'pi' || t.v === 'e') return { k: 'const', name: t.v }
      const nt = this.peek()
      if (nt.t === 'end' || nt.t === 'rel' || nt.t === 'sup' || (nt.t === 'op' && nt.v !== '(' && nt.v !== '|' && nt.v !== '-')) {
        this.fail('missingArg', nt, t.v)
      }
      // `sin(x)^2` squares the sine; without brackets the argument runs up to the next function name:
      // `sin 2x` = sin(2x), `sin x^2` = sin(x^2), `sin x cos x` = sin(x)·cos(x).
      const bracketed = (nt.t === 'op' && nt.v === '(') || (nt.t === 'node' && nt.node.k === 'paren')
      const arg = bracketed ? this.primary() : this.bareArg()
      const call: MathNode = t.base ? { k: 'log', base: t.base, a: arg } : { k: 'fn', name: t.v, a: arg }
      // sin²x: the power written on the name applies to the whole value.
      return t.exp ? { k: 'pow', a: call, b: t.exp } : call
    }
    if (t.t === 'op' && t.v === '(') {
      const saved = this.bars
      this.bars = 0
      const inner = this.expr()
      this.bars = saved
      if (!this.isOp(')')) this.fail('missingParen', this.peek())
      this.next()
      return { k: 'paren', a: inner }
    }
    if (t.t === 'op' && t.v === '|') {
      this.bars++
      const inner = this.expr()
      this.bars--
      if (!this.isOp('|')) this.fail('missingBar', this.peek())
      this.next()
      return { k: 'abs', a: inner }
    }
    if (t.t === 'end') this.fail('missingArg', t)
    return this.fail('unexpected', t, describe(t))
  }
}

function describe(t: Tok): string | undefined {
  if (t.t === 'num') return String(t.v)
  if (t.t === 'name' || t.t === 'op' || t.t === 'rel') return t.v
  return undefined
}
