// Typesetting of formulas next to the curves (engine/mathtype.ts, labels in engine/graph.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphPrims, graphSvg, placeLabels, sanitizeGraph, type Label } from '../src/board/engine/graph.ts'
import { parseExpr } from '@inkboard/math/mathexpr'
import { typesetFormula, type MathBox } from '../src/board/engine/mathtype.ts'
import type { GraphItem, PlotFn } from '@inkboard/core/types'

function set(src: string, size = 20): MathBox {
  const r = parseExpr(src)
  assert.ok(r.ok)
  return typesetFormula(r.node, size, r.comma)
}
const glyphs = (b: MathBox): string => b.texts.map((t) => t.s).join('')

test('reads like a textbook: y =, italic x, typographic minus', () => {
  const b = set('2x - 1')
  assert.equal(glyphs(b), 'y=2x−1')
  assert.ok(b.texts.find((t) => t.s === 'x')!.italic)
  assert.ok(!b.texts.find((t) => t.s === '2')!.italic)
  assert.equal(b.lines.length, 0)
})

test('exponents are smaller and raised', () => {
  const b = set('x^2')
  const x = b.texts.find((t) => t.s === 'x')!
  const two = b.texts.find((t) => t.s === '2')!
  assert.ok(two.size < x.size && two.y < x.y && two.x > x.x)
})

test('fractions are stacked with a bar; brackets around numerator and denominator are dropped', () => {
  const b = set('(x + 1)/(x - 1)')
  assert.equal(b.lines.length, 1)
  assert.ok(!glyphs(b).includes('('))
  const one = b.texts.filter((t) => t.s === '1')
  assert.ok(one[0].y < b.lines[0].pts[0][1] && one[1].y > b.lines[0].pts[0][1])
})

test('square root gets a radical sign over its argument, no brackets', () => {
  const b = set('sqrt(x + 4)')
  assert.equal(b.lines.length, 1)
  assert.equal(glyphs(b), 'y=x+4')
})

test('functions keep school names and the brackets the teacher typed', () => {
  assert.equal(glyphs(set('tg x')), 'y=tgx')
  assert.equal(glyphs(set('sin(x)')), 'y=sin(x)')
  assert.equal(glyphs(set('2*3x')), 'y=2·3x')
  assert.equal(glyphs(set('0,5x + pi')), 'y=0,5x+π')
  assert.equal(glyphs(set('0.5x')), 'y=0.5x')
})

test('absolute value is drawn with bars', () => {
  const b = set('|x| - 3')
  assert.equal(b.lines.length, 2)
  assert.equal(glyphs(b), 'y=x−3')
})

const plane = (fns: PlotFn[], extra = {}): GraphItem => ({
  ...sanitizeGraph({ kind: 'plane', xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false, fns, ...extra }),
  type: 'graph', id: 'g', z: 0, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
})

test('each function gets its formula in its colour, inside the plane', () => {
  const g = plane([{ expr: 'x^2', color: '#e03131' }, { expr: '2x + 1', color: '#1971c2' }])
  const p = graphPrims(g)
  const math = p.texts.filter((t) => t.math)
  assert.ok(math.some((t) => t.color === '#e03131') && math.some((t) => t.color === '#1971c2'))
  for (const t of math) assert.ok(t.x >= -240 && t.x <= 240 && t.y >= -240 && t.y <= 240)
  assert.ok(graphSvg(g).includes('font-style="italic"'))
})

test('formulas can be switched off', () => {
  const g = plane([{ expr: 'x^2', color: '#e03131' }], { hideFormulas: true })
  assert.equal(g.hideFormulas, true)
  assert.equal(graphPrims(g).texts.filter((t) => t.math).length, 0)
})

test('labels at the same spot are pushed apart', () => {
  const box = (): MathBox => ({ w: 60, asc: 14, desc: 4, texts: [], lines: [] })
  const ls: Label[] = [
    { color: 'a', box: box(), ax: 100, ay: 0, x: 0, y: 0 },
    { color: 'b', box: box(), ax: 100, ay: 0, x: 0, y: 0 }
  ]
  placeLabels(ls, { minX: -240, maxX: 240, minY: -240, maxY: 240 }, 24)
  const [a, b] = ls
  assert.ok(a.y + a.box.desc <= b.y - b.box.asc || b.y + b.box.desc <= a.y - a.box.asc)
})

test('live rows keep drawing the last valid formula while one is half-typed', async () => {
  const { liveFns } = await import('../src/board/engine/graph.ts')
  const { EMPTY_FORMULA, typeChar } = await import('@inkboard/math/formula')
  const typed = (s: string) => [...s].reduce(typeChar, EMPTY_FORMULA)
  const sq = typed('x^2 ')
  let r = liveFns([{ key: 1, st: sq, color: '#e03131', shown: null }])
  assert.deepEqual(r.fns, [{ expr: 'x^2', color: '#e03131', rows: sq.rows }])
  // Half-built (`x² +`): the curve of the last complete formula stays.
  r = liveFns([{ ...r.rows[0], st: typed('x^2 +') }])
  assert.deepEqual(r.fns, [{ expr: 'x^2', color: '#e03131', rows: sq.rows }])
  r = liveFns([{ ...r.rows[0], st: typed('x^2 +1') }])
  assert.equal(r.fns[0].expr, 'x^2+1')
  r = liveFns([{ ...r.rows[0], st: EMPTY_FORMULA }, { key: 2, st: typed('sin'), color: '#1971c2', shown: null }])
  assert.deepEqual(r.fns, [])
})
