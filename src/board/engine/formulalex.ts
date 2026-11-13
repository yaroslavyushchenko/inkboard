/**
 * The second lexer: a keypad formula (engine/formula.ts) to the same tokens as typed text
 * (engine/mathlex.ts), for the one parser in engine/mathparse.ts. Digits are joined into numbers and
 * letters into names; structures that already group their content (a stacked fraction, a root,
 * brackets) are parsed on the spot and handed over as finished parts.
 */
import type { Atom, Row } from './formula'
import { FUNCS, namesFor, ParseError, RELATIONS, splitNames, type Tok, type TokAt } from './mathlex'
import { Parser, type MathNode } from './mathparse'

const OPS: Record<string, '+' | '-' | '*' | '/' | '(' | ')' | '|' | '!' | '%' | '°'> = {
  '+': '+', '−': '-', '-': '-', '·': '*', '×': '*', '*': '*', '÷': '/', ':': '/',
  '(': '(', ')': ')', '|': '|', '!': '!', '%': '%', '°': '°'
}

const isChar = (a: Atom | undefined, re: RegExp): a is { t: 'c'; s: string } => !!a && a.t === 'c' && re.test(a.s)

export interface LexInfo {
  /** A decimal comma was used (results are then written with a comma too). */
  comma: boolean
  /** The variable of the function (x unless set): t, a, φ… It reaches the parser as x. */
  arg?: string
  /** Reading one side of an equation in x and y: y is a variable too. */
  y?: boolean
}

/** Tokens of the atoms `from`…`to` of a row (no end token). */
export function lexRow(row: Row, path: number[], info: LexInfo, from = 0, to = row.length): Tok[] {
  const out: Tok[] = []
  const at = (i: number): TokAt => ({ path, i })
  const part = (r: Row, k: number, slot: number): MathNode => parseRow(r, [...path, k, slot], info)
  let k = from
  while (k < to) {
    const a = row[k]
    const here = at(k)
    if (a.t === 'c') {
      if (/^[0-9.,]$/.test(a.s)) {
        let text = ''
        let dot = false
        let j = k
        for (; j < to; j++) {
          const d = row[j]
          if (d.t !== 'c') break
          if (/^[0-9]$/.test(d.s)) text += d.s
          else if (!dot && /^[.,]$/.test(d.s) && j + 1 < to && isChar(row[j + 1], /^[0-9]$/)) {
            if (d.s === ',') info.comma = true
            dot = true
            text += '.'
          } else break
        }
        if (j === k) throw new ParseError('unexpected', 0, a.s, here)
        out.push({ t: 'num', v: Number(text), text, pos: 0, at: here })
        k = j
        continue
      }
      if (/^[a-z]$/.test(a.s)) {
        let word = ''
        let j = k
        while (j < to && isChar(row[j], /^[a-z]$/)) word += (row[j++] as { s: string }).s
        const v = info.arg ?? 'x'
        for (const n of splitNames(
          word,
          (off, rest) => {
            throw new ParseError('unknownName', 0, rest, at(k + off))
          },
          namesFor(v, info.y)
        )) {
          out.push({ t: 'name', v: n.name === v ? 'x' : n.name, pos: 0, at: at(k + n.offset) })
        }
        k = j
        continue
      }
      // School notation for counting: C with n below and k above, A likewise (arrangements).
      const scr = row[k + 1]
      if ((a.s === 'C' || a.s === 'A') && scr?.t === 'script' && scr.sup && scr.sub && k + 1 < to) {
        const node: MathNode = { k: 'comb', kind: a.s === 'C' ? 'C' : 'P', n: part(scr.sub, k + 1, 1), r: part(scr.sup, k + 1, 0) }
        out.push({ t: 'node', node, pos: 0, at: here })
        k += 2
        continue
      }
      if (a.s === info.arg) out.push({ t: 'name', v: 'x', pos: 0, at: here })
      else if (a.s === 'π') out.push({ t: 'name', v: 'pi', pos: 0, at: here })
      else if (OPS[a.s]) out.push({ t: 'op', v: OPS[a.s], pos: 0, at: here })
      else if (RELATIONS.includes(a.s)) out.push({ t: 'rel', v: a.s, pos: 0, at: here })
      else if (/^\p{L}$/u.test(a.s)) throw new ParseError('unknownName', 0, a.s, here)
      else throw new ParseError('unsupported', 0, a.s, here)
      k++
      continue
    }
    if (a.t === 'op') {
      if (!(a.s in FUNCS)) throw new ParseError('unsupported', 0, a.s, here)
      const tok: Tok = { t: 'name', v: a.s, pos: 0, at: here }
      const next = row[k + 1]
      // A power or a base written on the name itself: sin²x, log₂x.
      if (next?.t === 'script' && k + 1 < to) {
        let slot = 0
        if (next.sup) tok.exp = part(next.sup, k + 1, slot++)
        if (next.sub) {
          if (a.s !== 'log') throw new ParseError('unsupported', 0, a.s, at(k + 1))
          tok.base = part(next.sub, k + 1, slot)
        }
        k++
      }
      out.push(tok)
      k++
      continue
    }
    let node: MathNode
    switch (a.t) {
      case 'script':
        // An index on a letter (aₙ) is a name of its own, not something to compute.
        if (a.sub) throw new ParseError('unsupported', 0, undefined, here)
        out.push({ t: 'sup', node: part(a.sup!, k, 0), pos: 0, at: here })
        k++
        continue
      case 'frac':
        node = { k: 'bin', op: '/', a: part(a.n, k, 0), b: part(a.d, k, 1) }
        break
      case 'root':
        node = a.i ? { k: 'root', index: part(a.i, k, 0), a: part(a.x, k, 1) } : { k: 'fn', name: 'sqrt', a: part(a.x, k, 0) }
        break
      case 'fence':
        node = a.k === 'bar' ? { k: 'abs', a: part(a.x, k, 0) } : { k: 'paren', a: part(a.x, k, 0) }
        break
      case 'comb':
        node = { k: 'comb', kind: a.s, n: part(a.n, k, 0), r: part(a.k, k, 1) }
        break
      case 'grid':
        if (a.k !== 'binom' || a.cells.length !== 2) throw new ParseError('unsupported', 0, undefined, here)
        node = { k: 'comb', kind: 'C', n: part(a.cells[0], k, 0), r: part(a.cells[1], k, 1) }
        break
      default:
        // Limits, derivatives, integrals, sums, matrices: written, not calculated.
        throw new ParseError('unsupported', 0, undefined, here)
    }
    out.push({ t: 'node', node, pos: 0, at: here })
    k++
  }
  return out
}

/** Parse one row of a formula (a slot, or the whole thing); throws ParseError. */
export function parseRow(row: Row, path: number[], info: LexInfo, from = 0, to = row.length): MathNode {
  if (to <= from) throw new ParseError('empty', 0, undefined, { path, i: from })
  return new Parser([...lexRow(row, path, info, from, to), { t: 'end', pos: 0, at: { path, i: to } }]).parse()
}
