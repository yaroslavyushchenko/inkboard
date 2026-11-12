/**
 * A formula as it is built on the math keypad: not a line of text but a small tree. A row is a list
 * of atoms; structures (a fraction, a root, an integral) are atoms with slots, and every slot is a
 * row again. The caret lives in a row, between two atoms. Everything here is plain data and pure
 * functions: the same tree is stored in the board file, typeset (engine/formulatype.ts) and read by
 * the calculator (engine/formulalex.ts).
 */
import { FUNCS } from './mathlex'

export type Row = Atom[]

export type Atom =
  /** One character: a digit, a letter, a sign, a Greek letter, ∞. */
  | { t: 'c'; s: string }
  /** A name written upright: sin, log, ln. */
  | { t: 'op'; s: string }
  | { t: 'frac'; n: Row; d: Row }
  /** Root of `x`; `i` is its degree (absent = square root). */
  | { t: 'root'; x: Row; i?: Row }
  /** Exponent and / or index of the atom before it. */
  | { t: 'script'; sup?: Row; sub?: Row }
  | { t: 'fence'; k: 'paren' | 'bar' | 'square'; x: Row }
  /** A bar over `x` (conjugate, mean). */
  | { t: 'over'; x: Row }
  /** Combinations and arrangements: ₙCₖ, ₙPₖ, ₙVₖ. */
  | { t: 'comb'; s: 'C' | 'P' | 'V'; n: Row; k: Row }
  /** lim with `v → to` under it; `side` adds the one-sided + or −. */
  | { t: 'lim'; v: Row; to: Row; side?: '+' | '-' }
  /** d/dv, or the n-th derivative dⁿ/dvⁿ. */
  | { t: 'deriv'; v: Row; n?: Row }
  /** ∫ x dv, definite when it has both limits. */
  | { t: 'int'; x: Row; v: Row; lo?: Row; hi?: Row }
  /** Σ from `i = from` to `to` (what is summed follows it in the row). */
  | { t: 'sum'; i: Row; from: Row; to: Row }
  /** Matrix [ ], determinant | | or binomial coefficient ( ): `cells` row by row, `cols` per row. */
  | { t: 'grid'; k: 'matrix' | 'det' | 'binom'; cols: number; cells: Row[] }

/** A caret position: `path` leads to a row (atom index, slot index, atom index, …), `i` is the place in it. */
export interface Cursor {
  path: number[]
  i: number
}

export interface FormulaState {
  rows: Row
  cur: Cursor
}

export const EMPTY_FORMULA: FormulaState = { rows: [], cur: { path: [], i: 0 } }

// ------------------------------------------------------------------ slots

/** The rows inside an atom, in the order the caret walks through them. */
export function slots(a: Atom): Row[] {
  switch (a.t) {
    case 'c':
    case 'op':
      return []
    case 'frac':
      return [a.n, a.d]
    case 'root':
      return a.i ? [a.i, a.x] : [a.x]
    case 'script':
      return [...(a.sup ? [a.sup] : []), ...(a.sub ? [a.sub] : [])]
    case 'fence':
    case 'over':
      return [a.x]
    case 'comb':
      return [a.n, a.k]
    case 'lim':
      return [a.v, a.to]
    case 'deriv':
      return a.n ? [a.n, a.v] : [a.v]
    case 'int':
      return a.lo && a.hi ? [a.lo, a.hi, a.x, a.v] : [a.x, a.v]
    case 'sum':
      return [a.i, a.from, a.to]
    case 'grid':
      return a.cells
  }
}

/** The same atom with other rows in its slots (same order as `slots`). */
export function withSlots(a: Atom, r: Row[]): Atom {
  switch (a.t) {
    case 'c':
    case 'op':
      return a
    case 'frac':
      return { ...a, n: r[0], d: r[1] }
    case 'root':
      return a.i ? { ...a, i: r[0], x: r[1] } : { ...a, x: r[0] }
    case 'script': {
      const out: Atom = { t: 'script' }
      let k = 0
      if (a.sup) out.sup = r[k++]
      if (a.sub) out.sub = r[k++]
      return out
    }
    case 'fence':
    case 'over':
      return { ...a, x: r[0] }
    case 'comb':
      return { ...a, n: r[0], k: r[1] }
    case 'lim':
      return { ...a, v: r[0], to: r[1] }
    case 'deriv':
      return a.n ? { ...a, n: r[0], v: r[1] } : { ...a, v: r[0] }
    case 'int':
      return a.lo && a.hi ? { ...a, lo: r[0], hi: r[1], x: r[2], v: r[3] } : { ...a, x: r[0], v: r[1] }
    case 'sum':
      return { ...a, i: r[0], from: r[1], to: r[2] }
    case 'grid':
      return { ...a, cells: r }
  }
}

/** The row a path leads to. */
export function rowAt(rows: Row, path: readonly number[]): Row {
  let row = rows
  for (let k = 0; k + 1 < path.length; k += 2) row = slots(row[path[k]])[path[k + 1]]
  return row
}

/** A copy of the tree with the row at `path` replaced. */
export function setRow(rows: Row, path: readonly number[], next: Row): Row {
  if (!path.length) return next
  const [ai, si] = path
  const atom = rows[ai]
  const inner = slots(atom)
  const filled = inner.map((r, k) => (k === si ? setRow(r, path.slice(2), next) : r))
  return rows.map((a, k) => (k === ai ? withSlots(atom, filled) : a))
}

// ------------------------------------------------------------------ characters

/** Signs that stand between things; they end a "factor" and can't carry an exponent. */
const SEPARATORS = '+−-±·×÷:=<>≤≥≠≈→,;()|'

export const isSeparator = (a: Atom | undefined): boolean => !a || (a.t === 'c' && SEPARATORS.includes(a.s))

/** Is there something before position `i` that an exponent or index can sit on (x², sin², log₂)? */
export const hasBase = (row: Row, i: number): boolean => i > 0 && !isSeparator(row[i - 1])

const TYPED: Record<string, string> = { '*': '·', '-': '−', '–': '−', '—': '−', '×': '·', '∙': '·', '⋅': '·' }

/** Letter runs that turn into something when typed: names become upright, a few become symbols. */
const AUTO_NAMES = [...Object.keys(FUNCS).filter((n) => !['abs', 'sqrt', 'cbrt'].includes(n)), 'lim'].sort((a, b) => b.length - a.length)

const c = (s: string): Atom => ({ t: 'c', s })
const isLetter = (a: Atom | undefined): a is { t: 'c'; s: string } => !!a && a.t === 'c' && /^[a-z]$/.test(a.s)

// ------------------------------------------------------------------ editing

function firstEmpty(atom: Atom, path: number[]): Cursor | null {
  const inner = slots(atom)
  for (let k = 0; k < inner.length; k++) {
    if (!inner[k].length) return { path: [...path, k], i: 0 }
    for (let j = 0; j < inner[k].length; j++) {
      const deep = firstEmpty(inner[k][j], [...path, k, j])
      if (deep) return deep
    }
  }
  return null
}

/**
 * Put atoms at the caret. The caret then goes to the first empty slot of what was inserted (the
 * numerator of a new fraction), or after it. An exponent with nothing to sit on keeps the caret in
 * front of it, where its base is typed.
 */
export function insert(st: FormulaState, atoms: Atom[]): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  const first = atoms[0]
  // A second script on the same base joins the first one: x² then an index gives x²ₙ in one atom.
  const prev = row[i - 1]
  if (atoms.length === 1 && first.t === 'script' && prev?.t === 'script') {
    const adds = (first.sup && !prev.sup) || (first.sub && !prev.sub)
    const clash = (first.sup && prev.sup) || (first.sub && prev.sub)
    if (adds && !clash) {
      const merged: Atom = { t: 'script', ...(prev.sup || first.sup ? { sup: prev.sup ?? first.sup } : {}), ...(prev.sub || first.sub ? { sub: prev.sub ?? first.sub } : {}) }
      const rows = setRow(st.rows, path, [...row.slice(0, i - 1), merged, ...row.slice(i)])
      const k = slots(merged).indexOf((first.sup ?? first.sub)!)
      const empty = !(first.sup ?? first.sub)!.length
      return { rows, cur: empty ? { path: [...path, i - 1, k], i: 0 } : { path, i } }
    }
  }
  const rows = setRow(st.rows, path, [...row.slice(0, i), ...atoms, ...row.slice(i)])
  if (first?.t === 'script' && !hasBase(row, i)) return { rows, cur: { path, i } }
  for (let k = 0; k < atoms.length; k++) {
    const hole = firstEmpty(atoms[k], [...path, i + k])
    if (hole) return { rows, cur: hole }
  }
  return { rows, cur: { path, i: i + atoms.length } }
}

/** How many atoms before `i` form the thing a fraction bar would go under: `2x`, `(a+b)²`, `√5`. */
function factorStart(row: Row, i: number): number {
  let k = i
  while (k > 0) {
    const a = row[k - 1]
    if (isSeparator(a) || a.t === 'op' || a.t === 'lim' || a.t === 'sum' || a.t === 'int' || a.t === 'deriv') break
    k--
  }
  return k
}

/** A new fraction; what stands right before the caret becomes its numerator. */
export function insertFraction(st: FormulaState): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  const k = factorStart(row, i)
  if (k === i) return insert(st, [{ t: 'frac', n: [], d: [] }])
  const frac: Atom = { t: 'frac', n: row.slice(k, i), d: [] }
  return { rows: setRow(st.rows, path, [...row.slice(0, k), frac, ...row.slice(i)]), cur: { path: [...path, k, 1], i: 0 } }
}

/** Where the caret goes when it leaves the row at `path` forwards: after the atom that holds it. */
const after = (path: number[]): Cursor => ({ path: path.slice(0, -2), i: path[path.length - 2] + 1 })
const before = (path: number[]): Cursor => ({ path: path.slice(0, -2), i: path[path.length - 2] })

/** The fence the caret is in, if it stands at the end of one of this kind. */
function atEndOfFence(st: FormulaState, kind: 'paren' | 'bar' | 'square'): boolean {
  const { path, i } = st.cur
  if (!path.length || i !== rowAt(st.rows, path).length) return false
  const holder = rowAt(st.rows, path.slice(0, -2))[path[path.length - 2]]
  return holder.t === 'fence' && holder.k === kind
}

/** A typed letter may complete a name: s, i, n becomes an upright "sin"; "pi" becomes π. */
function autoName(st: FormulaState): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  let start = i
  while (start > 0 && isLetter(row[start - 1])) start--
  const word = row
    .slice(start, i)
    .map((a) => (a as { s: string }).s)
    .join('')
  if (!word) return st
  const replace = (from: number, atoms: Atom[]): FormulaState =>
    insert({ rows: setRow(st.rows, path, [...row.slice(0, from), ...row.slice(i)]), cur: { path, i: from } }, atoms)
  // sin + h = sinh: the name before the letters grows.
  const prev = row[start - 1]
  if (prev?.t === 'op' && AUTO_NAMES.includes(prev.s + word)) return replace(start - 1, [{ t: 'op', s: prev.s + word }])
  if (word.endsWith('sqrt')) return replace(i - 4, [{ t: 'root', x: [] }])
  if (word.endsWith('pi')) return replace(i - 2, [c('π')])
  const name = AUTO_NAMES.find((n) => word.endsWith(n))
  if (!name) return st
  if (name === 'lim') return replace(i - 3, [{ t: 'lim', v: [], to: [] }])
  return replace(i - name.length, [{ t: 'op', s: name }])
}

/** One character from the keyboard or a keypad key, with the usual shortcuts (`/`, `^`, `_`, brackets). */
export function typeChar(st: FormulaState, ch: string): FormulaState {
  if (ch === ' ') return moveRight(st)
  if (ch === '/') return insertFraction(st)
  if (ch === '^') return insert(st, [{ t: 'script', sup: [] }])
  if (ch === '_') return insert(st, [{ t: 'script', sub: [] }])
  if (ch === '(') return insert(st, [{ t: 'fence', k: 'paren', x: [] }])
  if (ch === '[') return insert(st, [{ t: 'fence', k: 'square', x: [] }])
  if ((ch === ')' && atEndOfFence(st, 'paren')) || (ch === ']' && atEndOfFence(st, 'square'))) return { rows: st.rows, cur: after(st.cur.path) }
  if (ch === '|') return atEndOfFence(st, 'bar') ? { rows: st.rows, cur: after(st.cur.path) } : insert(st, [{ t: 'fence', k: 'bar', x: [] }])
  const s = TYPED[ch] ?? ch
  const next = insert(st, [c(s)])
  return /^[a-z]$/.test(s) ? autoName(next) : next
}

export function moveRight(st: FormulaState): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  if (i < row.length) {
    return { rows: st.rows, cur: slots(row[i]).length ? { path: [...path, i, 0], i: 0 } : { path, i: i + 1 } }
  }
  if (!path.length) return st
  // End of a slot: on to the atom's next slot, or out of the atom.
  const si = path[path.length - 1]
  const holder = rowAt(st.rows, path.slice(0, -2))[path[path.length - 2]]
  if (si + 1 < slots(holder).length) return { rows: st.rows, cur: { path: [...path.slice(0, -1), si + 1], i: 0 } }
  return { rows: st.rows, cur: after(path) }
}

export function moveLeft(st: FormulaState): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  if (i > 0) {
    const inner = slots(row[i - 1])
    if (!inner.length) return { rows: st.rows, cur: { path, i: i - 1 } }
    return { rows: st.rows, cur: { path: [...path, i - 1, inner.length - 1], i: inner[inner.length - 1].length } }
  }
  if (!path.length) return st
  const si = path[path.length - 1]
  if (si > 0) {
    const holder = rowAt(st.rows, path.slice(0, -2))[path[path.length - 2]]
    return { rows: st.rows, cur: { path: [...path.slice(0, -1), si - 1], i: slots(holder)[si - 1].length } }
  }
  return { rows: st.rows, cur: before(path) }
}

export const moveHome = (st: FormulaState): FormulaState => ({ rows: st.rows, cur: { path: [], i: 0 } })
export const moveEnd = (st: FormulaState): FormulaState => ({ rows: st.rows, cur: { path: [], i: st.rows.length } })

/**
 * Backspace. A plain character is removed. A structure with something in it is entered first (so
 * its content goes character by character); an empty one disappears. At the start of a slot the
 * structure is taken apart and its content stays in the row.
 */
export function backspace(st: FormulaState): FormulaState {
  const { path, i } = st.cur
  const row = rowAt(st.rows, path)
  if (i > 0) {
    const prev = row[i - 1]
    const inner = slots(prev)
    if (inner.some((r) => r.length)) return moveLeft(st)
    return { rows: setRow(st.rows, path, [...row.slice(0, i - 1), ...row.slice(i)]), cur: { path, i: i - 1 } }
  }
  if (!path.length) return st
  const outer = path.slice(0, -2)
  const ai = path[path.length - 2]
  const si = path[path.length - 1]
  const parent = rowAt(st.rows, outer)
  const inner = slots(parent[ai])
  const lead = inner.slice(0, si).reduce((n, r) => n + r.length, 0)
  const flat = inner.flat()
  return { rows: setRow(st.rows, outer, [...parent.slice(0, ai), ...flat, ...parent.slice(ai + 1)]), cur: { path: outer, i: ai + lead } }
}

/** Nothing typed at all (an empty template still counts as something). */
export const isBlank = (rows: Row): boolean => rows.length === 0

// ------------------------------------------------------------------ reading files

const MAX_DEPTH = 12
const MAX_ATOMS = 600

/** Check data from a file: a well-formed tree within sane limits comes back, anything else is null. */
export function validateRows(v: unknown): Row | null {
  let count = 0
  const row = (r: unknown, depth: number): Row | null => {
    if (!Array.isArray(r) || depth > MAX_DEPTH) return null
    const out: Row = []
    for (const a of r) {
      const ok = atom(a, depth)
      if (!ok) return null
      out.push(ok)
    }
    return out
  }
  const atom = (a: unknown, depth: number): Atom | null => {
    if (!a || typeof a !== 'object' || ++count > MAX_ATOMS) return null
    const o = a as Record<string, unknown>
    const sub = (k: string): Row | null => row(o[k], depth + 1)
    const opt = (k: string): Row | null | undefined => (o[k] === undefined ? undefined : sub(k))
    switch (o.t) {
      case 'c':
        return typeof o.s === 'string' && [...o.s].length === 1 ? { t: 'c', s: o.s } : null
      case 'op':
        return typeof o.s === 'string' && /^[a-z]{1,8}$/.test(o.s) ? { t: 'op', s: o.s } : null
      case 'frac': {
        const n = sub('n')
        const d = sub('d')
        return n && d ? { t: 'frac', n, d } : null
      }
      case 'root': {
        const x = sub('x')
        const i = opt('i')
        return x && i !== null ? { t: 'root', x, ...(i ? { i } : {}) } : null
      }
      case 'script': {
        const sup = opt('sup')
        const sb = opt('sub')
        if (sup === null || sb === null || (!sup && !sb)) return null
        return { t: 'script', ...(sup ? { sup } : {}), ...(sb ? { sub: sb } : {}) }
      }
      case 'fence': {
        const x = sub('x')
        return x && (o.k === 'paren' || o.k === 'bar' || o.k === 'square') ? { t: 'fence', k: o.k, x } : null
      }
      case 'over': {
        const x = sub('x')
        return x ? { t: 'over', x } : null
      }
      case 'comb': {
        const n = sub('n')
        const k = sub('k')
        return n && k && (o.s === 'C' || o.s === 'P' || o.s === 'V') ? { t: 'comb', s: o.s, n, k } : null
      }
      case 'lim': {
        const x = sub('v')
        const to = sub('to')
        return x && to ? { t: 'lim', v: x, to, ...(o.side === '+' || o.side === '-' ? { side: o.side } : {}) } : null
      }
      case 'deriv': {
        const x = sub('v')
        const n = opt('n')
        return x && n !== null ? { t: 'deriv', v: x, ...(n ? { n } : {}) } : null
      }
      case 'int': {
        const x = sub('x')
        const dv = sub('v')
        const lo = opt('lo')
        const hi = opt('hi')
        if (!x || !dv || lo === null || hi === null || !lo !== !hi) return null
        return { t: 'int', x, v: dv, ...(lo && hi ? { lo, hi } : {}) }
      }
      case 'sum': {
        const i = sub('i')
        const from = sub('from')
        const to = sub('to')
        return i && from && to ? { t: 'sum', i, from, to } : null
      }
      case 'grid': {
        if (!Array.isArray(o.cells) || typeof o.cols !== 'number' || !Number.isInteger(o.cols)) return null
        if (o.cols < 1 || o.cols > 6 || !o.cells.length || o.cells.length > 36 || o.cells.length % o.cols) return null
        if (o.k !== 'matrix' && o.k !== 'det' && o.k !== 'binom') return null
        const cells: Row[] = []
        for (const cell of o.cells) {
          const r = row(cell, depth + 1)
          if (!r) return null
          cells.push(r)
        }
        return { t: 'grid', k: o.k, cols: o.cols, cells }
      }
      default:
        return null
    }
  }
  return row(v, 0)
}
