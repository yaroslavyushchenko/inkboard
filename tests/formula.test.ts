// Keypad formulas: editing the tree (engine/formula.ts), what it means (formulalex / formulaexpr)
// and how it is laid out (formulatype). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  backspace, EMPTY_FORMULA, insert, insertFraction, moveLeft, moveRight, rowAt, typeChar, validateRows,
  type Atom, type FormulaState, type Row
} from '../src/renderer/src/engine/formula.ts'
import { nodeToRows, nodeToText, numericResult, parseRows, readPlotRows, rowsToText } from '../src/renderer/src/engine/formulaexpr.ts'
import { caretAt, caretOf, caretVertical, formulaBBox, formulaSvg, typesetRows } from '../src/renderer/src/engine/formulatype.ts'
import { parseExpr } from '../src/renderer/src/engine/mathexpr.ts'

const type = (s: string, st: FormulaState = EMPTY_FORMULA): FormulaState => [...s].reduce(typeChar, st)
const rows = (s: string): Row => type(s).rows
/** Compact notation of a tree, to compare shapes. */
const show = (r: Row): string =>
  r
    .map((a: Atom) => {
      switch (a.t) {
        case 'c':
          return a.s
        case 'op':
          return `\\${a.s} `
        case 'frac':
          return `{${show(a.n)}/${show(a.d)}}`
        case 'root':
          return a.i ? `root[${show(a.i)}](${show(a.x)})` : `√(${show(a.x)})`
        case 'script':
          return `${a.sup ? `^{${show(a.sup)}}` : ''}${a.sub ? `_{${show(a.sub)}}` : ''}`
        case 'fence':
          return a.k === 'bar' ? `|${show(a.x)}|` : a.k === 'square' ? `[${show(a.x)}]` : `(${show(a.x)})`
        default:
          return `<${a.t}>`
      }
    })
    .join('')
const value = (r: Row, x = NaN): number => {
  const p = parseRows(r)
  if (!p.ok) assert.fail(`${show(r)} failed: ${p.code}`)
  return p.fn(x)
}
const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)

test('typing builds structure: fraction, power, index, brackets', () => {
  assert.equal(show(rows('2x/3')), '{2x/3}')
  assert.equal(show(rows('1+2x/3')), '1+{2x/3}')
  assert.equal(show(rows('x^2')), 'x^{2}')
  assert.equal(show(rows('x^2 +1')), 'x^{2}+1')
  assert.equal(show(rows('a_n')), 'a_{n}')
  assert.equal(show(rows('(x+1)^2')), '(x+1)^{2}')
  assert.equal(show(rows('|x|')), '|x|')
  assert.equal(show(rows('2*3-1')), '2·3−1')
})

test('a fraction with nothing before it starts empty, caret in the numerator', () => {
  const st = type('/')
  assert.equal(show(st.rows), '{/}')
  assert.deepEqual(st.cur, { path: [0, 0], i: 0 })
  assert.equal(show(type('1 2', st).rows), '{1/2}')
})

test('letters become names; a name can grow', () => {
  assert.equal(show(rows('sinx')), '\\sin x')
  assert.equal(show(rows('xcos x')), 'x\\cos x')
  assert.equal(show(rows('arcsinx')), '\\arcsin x')
  assert.equal(show(rows('sinhx')), '\\sinh x')
  assert.equal(show(rows('ctgx')), '\\ctg x')
  assert.equal(show(rows('2pi')), '2π')
  assert.equal(show(rows('sqrtx')), '√(x)')
  assert.equal(rows('limx')[0].t, 'lim')
})

test('caret walks into and out of structures in both directions', () => {
  let st = type('1/2')
  assert.deepEqual(st.cur, { path: [0, 1], i: 1 })
  st = moveRight(st)
  assert.deepEqual(st.cur, { path: [], i: 1 })
  st = moveLeft(st)
  assert.deepEqual(st.cur, { path: [0, 1], i: 1 })
  st = moveLeft(moveLeft(st))
  assert.deepEqual(st.cur, { path: [0, 0], i: 1 })
  st = moveLeft(moveLeft(st))
  assert.deepEqual(st.cur, { path: [], i: 0 })
  assert.deepEqual(moveLeft(st).cur, st.cur)
})

test('backspace: characters first, then the empty structure; at the start of a slot it unwraps', () => {
  let st = type('x^2')
  st = backspace(st)
  assert.equal(show(st.rows), 'x^{}')
  st = backspace(st)
  assert.equal(show(st.rows), 'x')
  // After a filled structure Backspace steps into it instead of deleting it whole.
  st = moveRight(type('1/2'))
  st = backspace(st)
  assert.deepEqual(st.cur, { path: [0, 1], i: 1 })
  // At the start of the denominator the bar goes away and the digits stay.
  st = backspace(moveLeft(st))
  assert.equal(show(st.rows), '12')
  assert.deepEqual(st.cur, { path: [], i: 1 })
})

test('an exponent with no base waits for one', () => {
  const st = insert(EMPTY_FORMULA, [{ t: 'script', sup: [] }])
  assert.deepEqual(st.cur, { path: [], i: 0 })
  assert.equal(show(typeChar(st, 'x').rows), 'x^{}')
  // With a base the caret goes straight into the exponent.
  assert.deepEqual(insert(type('x'), [{ t: 'script', sup: [] }]).cur, { path: [1, 0], i: 0 })
  // A second script joins the first: one atom carries both.
  const both = insert(type('x^2 '), [{ t: 'script', sub: [] }])
  assert.equal(both.rows.length, 2)
  assert.equal(show(type('n', both).rows), 'x^{2}_{n}')
})

test('the fraction key takes the factor before the caret', () => {
  assert.equal(show(insertFraction(type('3+12')).rows), '3+{12/}')
  assert.equal(show(insertFraction(type('sinx')).rows), '\\sin {x/}')
  assert.equal(show(insertFraction(type('(a+b)')).rows.slice(0)), '{(a+b)/}')
})

test('files: a well-formed tree is accepted, anything else is refused', () => {
  const r = rows('x^2/3+sqrt2')
  assert.deepEqual(validateRows(JSON.parse(JSON.stringify(r))), r)
  assert.equal(validateRows('x'), null)
  assert.equal(validateRows([{ t: 'c', s: 'xy' }]), null)
  assert.equal(validateRows([{ t: 'frac', n: [] }]), null)
  assert.equal(validateRows([{ t: 'op', s: '<script>' }]), null)
  assert.equal(validateRows([{ t: 'grid', k: 'matrix', cols: 2, cells: [[], [], []] }]), null)
  let deep: unknown = []
  for (let i = 0; i < 40; i++) deep = [{ t: 'fence', k: 'paren', x: deep }]
  assert.equal(validateRows(deep), null)
})

test('the calculator reads the tree: numbers, decimal comma, precedence', () => {
  near(value(rows('2+3*4')), 14)
  // Space (or →) leaves the denominator; without it the + would be typed into it.
  near(value(rows('1/2 +1/4')), 0.75)
  near(value(rows('1/2+2')), 0.25)
  near(value(rows('0,5*4')), 2)
  near(value(rows('2^3^2')), 512) // typed inside the exponent: 2^(3²)
  near(value(rows('2x'), 3), 6)
  near(value(rows('x^2 -1'), 3), 8)
  near(value(rows('sqrt16')), 4)
  near(value(rows('|3-5|')), 2)
  near(value(rows('5!')), 120)
  near(value(rows('50%')), 0.5)
  near(value(rows('sin30°')), 0.5)
})

test('names carry powers and bases: sin²x, log₂8, roots of any degree', () => {
  const sin2: Row = [{ t: 'op', s: 'sin' }, { t: 'script', sup: [{ t: 'c', s: '2' }] }, { t: 'c', s: 'x' }]
  near(value(sin2, 0.5), Math.sin(0.5) ** 2)
  const log2: Row = [{ t: 'op', s: 'log' }, { t: 'script', sub: [{ t: 'c', s: '2' }] }, { t: 'c', s: '8' }]
  near(value(log2), 3)
  near(value([{ t: 'root', i: [{ t: 'c', s: '3' }], x: [{ t: 'c', s: '−' }, { t: 'c', s: '8' }] }]), -2)
  near(value([{ t: 'comb', s: 'C', n: [{ t: 'c', s: '5' }], k: [{ t: 'c', s: '2' }] }]), 10)
  near(value([{ t: 'comb', s: 'P', n: [{ t: 'c', s: '5' }], k: [{ t: 'c', s: '2' }] }]), 20)
  // sin(x)² squares the sine, exactly as in typed text.
  near(value(rows('sin(x)^2'), 0.5), Math.sin(0.5) ** 2)
})

test('text and keypad give the same function', () => {
  const samples = ['2x + 1', 'x^2 - 3x + 2', '(x + 1)/(x - 1)', 'sin 2x + cos x', 'sqrt(x + 4)', '|x - 1| - 2', '-x^2', '1/2x', '2^-x', 'sin(x)^2', 'x sin x', 'exp(x)/2', '0,5x^3', 'cbrt(x)', 'ln x^2']
  for (const src of samples) {
    const t = parseExpr(src)
    assert.ok(t.ok, src)
    const r = nodeToRows(t.node, t.comma)
    for (const x of [-2.5, -1, 0.3, 1.7, 4]) {
      const a = t.fn(x)
      const b = value(r, x)
      assert.ok((Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9, `${src} at ${x}: ${a} vs ${b}`)
    }
    // …and the text written for older versions plots the same curve again.
    const back = parseExpr(rowsToText(r))
    assert.ok(back.ok, `${src} -> ${rowsToText(r)}`)
    for (const x of [-2.5, 0.3, 4]) {
      const a = t.fn(x)
      const b = back.fn(x)
      assert.ok((Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9, `${src} -> ${rowsToText(r)} at ${x}`)
    }
  }
})

test('text for older versions keeps the grouping', () => {
  const t = (s: string): string => {
    const p = parseRows(rows(s))
    assert.ok(p.ok, s)
    return nodeToText(p.node)
  }
  assert.equal(t('2x/3'), '2*x/3')
  assert.equal(t('2-(x-1)'), '2-(x-1)')
  assert.equal(t('x^2 +1'), 'x^2+1')
  assert.equal(t('sqrtx'), 'sqrt(x)')
})

test('errors point into the formula; what is only written is not calculated', () => {
  const bad = (r: Row, code: string): void => {
    const p = parseRows(r)
    assert.ok(!p.ok)
    if (!p.ok) assert.equal(p.code, code, show(r))
  }
  bad(rows('a+1'), 'unknownName')
  bad(rows('2+'), 'missingArg')
  // One `=` makes an equation in x and y (x = 2 is a vertical line); a second one is too many.
  bad(rows('x=2=3'), 'unexpected')
  bad([{ t: 'frac', n: [{ t: 'c', s: '1' }], d: [] }], 'empty')
  bad([{ t: 'int', x: [{ t: 'c', s: 'x' }], v: [{ t: 'c', s: 'x' }] }], 'unsupported')
  bad(rows('a_n'), 'unknownName')
  const p = parseRows([{ t: 'frac', n: [{ t: 'c', s: '1' }], d: [] }])
  assert.deepEqual(!p.ok && p.at, { path: [0, 1], i: 0 })
  // `y =` in front is the name of the function, not part of it.
  near(value(rows('y=2x'), 2), 4)
})

test('numeric result: arithmetic only, rounded sensibly', () => {
  const res = (s: string, comma = false): string | null => {
    const r = numericResult(rows(s), comma)
    return r && `${r.approx ? '≈' : '='}${show(r.atoms)}`
  }
  assert.equal(res('2+3*4'), '=14')
  assert.equal(res('sqrt16'), '=4')
  assert.equal(res('sin30°'), '=0.5')
  assert.equal(res('1/3'), '≈0.33333333')
  assert.equal(res('1/4', true), '=0,25')
  assert.equal(res('0,5+1'), '=1,5')
  assert.equal(res('2-5'), '=−3')
  assert.equal(res('2^100'), '≈1.2676506·10^{30}')
  assert.equal(res('20!'), '≈2.432902·10^{18}')
  assert.equal(res('2+3='), '=5')
  assert.equal(numericResult(rows('2+3='))!.hasEq, true)
  // Not arithmetic, or nothing to work out.
  assert.equal(res('14'), null)
  assert.equal(res('2x+1'), null)
  assert.equal(res('1/0'), null)
  assert.equal(res('x=2'), null)
  assert.equal(res('2+'), null)
  assert.equal(res('14='), '=14')
})

test('rows stored with a plot are dropped when the text beside them was changed elsewhere', () => {
  const r = rows('x^2 +1')
  assert.deepEqual(readPlotRows(JSON.parse(JSON.stringify(r)), rowsToText(r)), r)
  assert.equal(readPlotRows(r, 'x^2+2'), null)
  assert.equal(readPlotRows('nonsense', 'x'), null)
})

test('layout: stacked fraction, raised exponent, a caret for every position', () => {
  const frac = typesetRows(rows('1/2'), 20, true)
  assert.equal(frac.box.lines.length, 1)
  const one = frac.box.texts.find((t) => t.s === '1')!
  const two = frac.box.texts.find((t) => t.s === '2')!
  assert.ok(one.y < frac.box.lines[0].pts[0][1] && two.y > frac.box.lines[0].pts[0][1])
  // Outside: before and after; inside: two positions in each of the two slots.
  assert.equal(frac.carets.length, 6)

  const pow = typesetRows(rows('x^2'), 20, true)
  const x = pow.box.texts.find((t) => t.s === 'x')!
  const e = pow.box.texts.find((t) => t.s === '2')!
  assert.ok(e.size < x.size && e.y < x.y && e.x > x.x)
  assert.ok(x.italic && !e.italic)
})

test('layout: empty slots are marked only while editing', () => {
  const st = type('/')
  assert.equal(typesetRows(st.rows, 20, true).holes.length, 2)
  assert.equal(typesetRows(st.rows, 20, false).holes.length, 0)
  assert.equal(typesetRows([], 20, true).holes.length, 1)
  // An exponent typed first shows where its base goes.
  assert.equal(typesetRows([{ t: 'script', sup: [] }], 20, true).ghosts.length, 1)
})

test('layout: caret lookup by point and by arrow up / down', () => {
  const st = type('12/34')
  const lay = typesetRows(st.rows, 20, true)
  const cur = caretOf(lay, st.cur)!
  assert.ok(cur.y > 0, 'denominator is below the baseline')
  const up = caretVertical(lay, st.cur, -1)!
  assert.deepEqual(up.path, [0, 0])
  assert.deepEqual(caretVertical(lay, up, 1)!.path, [0, 1])
  assert.equal(caretVertical(lay, up, -1), null)
  const hit = caretAt(lay, cur.x, cur.y - 2)!
  assert.deepEqual(hit, st.cur)
  assert.deepEqual(caretAt(lay, -50, 0), { path: [], i: 0 })
})

test('layout: every kind of structure lays out with a finite box', () => {
  const s: Row = []
  const all: Row = [
    { t: 'lim', v: [], to: [], side: '+' },
    { t: 'deriv', v: [{ t: 'c', s: 'x' }] },
    { t: 'deriv', v: [], n: [] },
    { t: 'int', x: [], v: [], lo: [], hi: [] },
    { t: 'int', x: s, v: [{ t: 'c', s: 'x' }] },
    { t: 'sum', i: [], from: [], to: [] },
    { t: 'grid', k: 'matrix', cols: 2, cells: [[], [], [], []] },
    { t: 'grid', k: 'det', cols: 3, cells: [[], [], [], [], [], [], [], [], []] },
    { t: 'grid', k: 'binom', cols: 1, cells: [[], []] },
    { t: 'comb', s: 'C', n: [], k: [] },
    { t: 'over', x: [{ t: 'c', s: 'z' }] },
    { t: 'root', x: [], i: [] },
    { t: 'fence', k: 'square', x: [{ t: 'frac', n: [], d: [] }] }
  ]
  for (const edit of [true, false]) {
    const lay = typesetRows(all, 24, edit)
    for (const v of [lay.box.w, lay.box.asc, lay.box.desc]) assert.ok(Number.isFinite(v) && v > 0)
    for (const t of lay.box.texts) assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y))
    for (const l of lay.box.lines) for (const [px, py] of l.pts) assert.ok(Number.isFinite(px) && Number.isFinite(py))
    if (edit) for (const m of lay.carets) assert.equal(rowAt(all, m.path).length >= m.i, true)
  }
  // The copy of the order in an n-th derivative is not a second place to type.
  assert.equal(typesetRows([{ t: 'deriv', v: [], n: [] }], 24, true).holes.length, 2)
})

test('a formula on the board: box from the top-left corner, SVG carries the glyphs', () => {
  const f = { x: 100, y: 50, size: 30, color: '#1e1e1e', rows: rows('x^2/3') }
  const b = formulaBBox(f)
  assert.equal(b.minX, 100)
  assert.equal(b.minY, 50)
  assert.ok(b.maxX > 100 && b.maxY > 50)
  const svg = formulaSvg(f)
  assert.ok(svg.includes('>x<') && svg.includes('<path') && svg.includes('font-style="italic"'))
})
