/**
 * The math keypad as data: what each key shows and what it puts into the formula. The face of a key
 * is itself a small formula, drawn by the same typesetter as the board, so a key with empty slots
 * looks exactly like what it inserts.
 */
import type { Atom, Row } from '../engine/formula'
import type { Lang } from '../i18n'

export type KeyAction =
  /** Characters as if typed (with the typing shortcuts: letters join into names). */
  | { k: 'type'; s: string }
  /** Atoms put at the caret; the caret goes to their first empty slot. */
  | { k: 'insert'; atoms: Row }
  /** A fraction that takes what stands before the caret as its numerator. */
  | { k: 'frac' }

export interface MathKey {
  face: Row
  act: KeyAction
  /** More keys shown on a long press (or right click). */
  more?: MathKey[]
  /** 'num' = the digit block, drawn a shade darker. */
  tone?: 'num'
}

export type KeypadTab = 'basic' | 'func' | 'trig' | 'calc'

const c = (s: string): Atom => ({ t: 'c', s })
const chars = (s: string): Row => [...s].map(c)
const op = (s: string): Atom => ({ t: 'op', s })
const sup = (...r: Row): Atom => ({ t: 'script', sup: r })
const sub = (...r: Row): Atom => ({ t: 'script', sub: r })
const paren = (...r: Row): Atom => ({ t: 'fence', k: 'paren', x: r })

/** A key that types characters; its face is those characters. */
const t = (s: string, more?: MathKey[]): MathKey => ({ face: chars(s), act: { k: 'type', s }, ...(more ? { more } : {}) })
/** A key that inserts atoms; its face is those atoms. */
const ins = (atoms: Row, more?: MathKey[]): MathKey => ({ face: atoms, act: { k: 'insert', atoms }, ...(more ? { more } : {}) })
const digit = (s: string): MathKey => ({ ...t(s), tone: 'num' })
/** A function name. Inserted, not typed, so it never merges with letters around it. */
const fn = (name: string, more?: MathKey[]): MathKey => ins([op(name)], more)

const matrix = (k: 'matrix' | 'det' | 'binom', rows: number, cols: number): MathKey =>
  ins([{ t: 'grid', k, cols, cells: Array.from({ length: rows * cols }, () => []) }])

const FRAC: MathKey = { face: [{ t: 'frac', n: [], d: [] }], act: { k: 'frac' } }

/** Multiplication and division signs: the dot and the colon in Ukrainian schools, × and ÷ elsewhere. */
const times = (lang: Lang): MathKey => (lang === 'uk' ? t('·', [t('×')]) : t('×', [t('·')]))
const divide = (lang: Lang): MathKey => (lang === 'uk' ? t(':', [t('÷')]) : t('÷', [t(':')]))
/** Tangent and cotangent are tg / ctg in Ukrainian textbooks. */
const trigNames = (lang: Lang): { tan: string; cot: string; atan: string; acot: string } =>
  lang === 'uk' ? { tan: 'tg', cot: 'ctg', atan: 'arctg', acot: 'arcctg' } : { tan: 'tan', cot: 'cot', atan: 'arctan', acot: 'arccot' }

export function keypadLayout(tab: KeypadTab, lang: Lang): { cols: number; keys: MathKey[] } {
  if (tab === 'basic') {
    return {
      cols: 6,
      keys: [
        ins([paren()], [t('('), t(')'), ins([{ t: 'fence', k: 'square', x: [] }]), ins([{ t: 'fence', k: 'bar', x: [] }])]),
        t('>', [t('≥'), t('<'), t('≤'), t('≠'), t('≈')]),
        digit('7'), digit('8'), digit('9'),
        divide(lang),

        FRAC,
        ins([{ t: 'root', x: [] }], [ins([{ t: 'root', x: [], i: [c('3')] }]), ins([{ t: 'root', x: [], i: [] }])]),
        digit('4'), digit('5'), digit('6'),
        times(lang),

        ins([sup(c('2'))], [ins([sup(c('3'))]), ins([sup()]), ins([sub()])]),
        t('x', [t('y'), t('z'), t('t'), t('n')]),
        digit('1'), digit('2'), digit('3'),
        t('−'),

        t('π', [t('e'), t('∞'), t('°')]),
        t('%', [t('!')]),
        digit('0'),
        t(',', [t('.'), t(';')]),
        t('='),
        t('+', [t('±')])
      ]
    }
  }
  if (tab === 'func') {
    const pick = (letter: 'C' | 'P' | 'V', school: string): MathKey =>
      ins([{ t: 'comb', s: letter, n: [], k: [] }], [ins([c(school), { t: 'script', sup: [], sub: [] }])])
    return {
      cols: 6,
      keys: [
        ins([{ t: 'fence', k: 'bar', x: [] }]),
        ins([c('f'), paren(c('x'))], [ins([c('g'), paren(c('x'))]), ins([c('h'), paren(c('x'))])]),
        ins([op('log'), sub(c('1'), c('0'))], [fn('lg')]),
        pick('V', 'A'),
        t('i'),
        t(';'),

        ins([sub()]),
        ins([c('g'), paren(c('x'))]),
        ins([op('log'), sub(c('2'))]),
        pick('P', 'A'),
        t('z', [t('w')]),
        t('!'),

        t('e'),
        ins([c('f'), paren(c('x'), c(','), c('y'))]),
        ins([op('log'), sub()]),
        pick('C', 'C'),
        ins([{ t: 'over', x: [c('z')] }], [ins([{ t: 'over', x: [] }])]),
        { ...matrix('matrix', 2, 2), more: [matrix('matrix', 3, 3), matrix('matrix', 2, 1), matrix('matrix', 3, 1), matrix('matrix', 2, 3)] },

        fn('exp'),
        ins([{ t: 'fence', k: 'square', x: [] }]),
        fn('ln'),
        matrix('binom', 2, 1),
        fn('sign'),
        { ...matrix('det', 2, 2), more: [matrix('det', 3, 3)] }
      ]
    }
  }
  if (tab === 'trig') {
    const n = trigNames(lang)
    const o = trigNames(lang === 'uk' ? 'en' : 'uk')
    const squared = (name: string): MathKey => ins([op(name), sup(c('2'))])
    return {
      cols: 6,
      keys: [
        fn('sin', [squared('sin')]),
        fn('cos', [squared('cos')]),
        fn(n.tan, [fn(o.tan), squared(n.tan)]),
        fn(n.cot, [fn(o.cot), squared(n.cot)]),
        t('°'),
        t('π'),

        fn('arcsin'),
        fn('arccos'),
        fn(n.atan, [fn(o.atan)]),
        fn(n.acot, [fn(o.acot)]),
        ins([paren()]),
        ins([sup(c('2'))], [ins([sup()])]),

        fn('sinh'),
        fn('cosh'),
        fn('tanh'),
        fn('coth'),
        t('α'),
        t('β'),

        fn('sec'),
        fn('csc'),
        t('x'),
        t('θ'),
        t('φ'),
        t('γ')
      ]
    }
  }
  const lim = (side?: '+' | '-'): MathKey => ins([{ t: 'lim', v: [], to: [], ...(side ? { side } : {}) }])
  return {
    cols: 5,
    keys: [
      lim(),
      ins([{ t: 'deriv', v: [c('x')] }]),
      ins([{ t: 'int', x: [], v: [c('x')] }]),
      ins([{ t: 'frac', n: chars('dy'), d: chars('dx') }]),
      ins([c('a'), sub(c('n'))]),

      lim('+'),
      ins([{ t: 'deriv', v: [] }]),
      ins([{ t: 'int', x: [], v: [] }]),
      ins(chars('dx')),
      t('→'),

      lim('-'),
      ins([{ t: 'deriv', v: [], n: [] }]),
      ins([{ t: 'int', x: [], v: [], lo: [], hi: [] }]),
      ins(chars('dy')),
      t('Δ'),

      t('∞'),
      t('e'),
      ins([{ t: 'sum', i: [], from: [], to: [] }]),
      ins([c('y'), c('′')]),
      t('±')
    ]
  }
}

/** Latin letters, then the Greek ones a school formula needs; a long press gives the capital. */
export function letterKeys(): { cols: number; keys: MathKey[] } {
  const upper = (s: string): MathKey => ins([c(s.toUpperCase())])
  const latin = [...'abcdefghijklmnopqrstuvwxyz'].map((s) => t(s, [upper(s)]))
  const greek = (s: string, more: string): MathKey => t(s, [...more].map((m) => t(m)))
  return {
    cols: 8,
    keys: [...latin, greek('α', 'δεΔ'), greek('β', 'μν'), greek('γ', 'στ'), greek('θ', 'ρψ'), greek('λ', 'ωΩ'), greek('φ', 'Φπ')]
  }
}
