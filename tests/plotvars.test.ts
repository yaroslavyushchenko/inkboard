// Plotting formulas from the board: other variables (t, a, φ), function names, ranges. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_FORMULA, typeChar, type Atom, type FormulaState, type Row } from '@inkboard/math/formula'
import { fnHead, labelRows, parseRows, plotFormula, plotHead, renameVar, rowsToText } from '../src/board/engine/formulaexpr.ts'
import { axisNames, graphPrims } from '../src/board/engine/graph.ts'
import type { GraphItem } from '@inkboard/core/types'

const rows = (s: string, st: FormulaState = EMPTY_FORMULA): Row => [...s].reduce(typeChar, st).rows
const c = (s: string): Atom => ({ t: 'c', s })
const at = (r: Row, v: number, arg?: string): number => {
  const p = parseRows(r, arg)
  assert.ok(p.ok, JSON.stringify(p))
  return p.ok ? p.fn(v) : NaN
}

test('a formula can be a function of t, a, n or φ', () => {
  assert.equal(at(rows('3t+1'), 2, 't'), 7)
  // In t, the letter x is unknown, and the other way round.
  const r = parseRows(rows('3t+1'))
  assert.ok(!r.ok && r.code === 'unknownName' && r.detail === 't')
  // Function names still win over the variable's letter: tan t, not t·a·n.
  assert.ok(Math.abs(at([{ t: 'op', s: 'tan' }, c('t')], 1, 't') - Math.tan(1)) < 1e-12)
  assert.ok(Math.abs(at(rows('tant'), 1, 't') - Math.tan(1)) < 1e-12)
  assert.equal(at([c('2'), c('φ')], 3, 'φ'), 6)
  // Text for older versions is always written in x.
  assert.equal(rowsToText(rows('3t+1'), 't'), '3*x+1')
})

test('the left side names the function and its variable', () => {
  const s = [c('s'), { t: 'fence', k: 'paren', x: [c('t')] } as Atom, c('='), c('5'), c('t')]
  assert.deepEqual(plotHead(s), { len: 3, name: 's', arg: 't' })
  assert.deepEqual(plotHead(rows('y=x')), { len: 2, name: 'y' })
  assert.deepEqual(plotHead(rows('x=5')), { len: 0 })
  // The head's variable wins over the one asked for.
  assert.equal(at(s, 2, 'x'), 10)
  assert.deepEqual(fnHead({ rows: s }), { name: 's', arg: 't' })
  assert.deepEqual(fnHead({ rows: rows('x'), name: 'f', arg: 'a' }), { name: 'f', arg: 'a' })
  // The label gets a left side unless the formula has its own.
  const shown = (r: Row): string => r.map((a) => (a.t === 'c' ? a.s : a.t === 'fence' ? `(${a.x.map((b) => (b.t === 'c' ? b.s : '?')).join('')})` : '?')).join('')
  assert.equal(shown(labelRows({ expr: 'x', color: '#000', rows: rows('x') })), 'y=x')
  assert.equal(shown(labelRows({ expr: 'x', color: '#000', rows: rows('t'), name: 'f', arg: 't' })), 'f(t)=t')
  assert.equal(shown(labelRows({ expr: 'x', color: '#000', rows: s })), 's(t)=5t')
})

test('a board formula is a function when it uses one variable or names it', () => {
  assert.deepEqual(plotFormula(rows('y=x^2')), { arg: 'x', name: 'y' })
  assert.deepEqual(plotFormula(rows('2x+1')), { arg: 'x' })
  assert.deepEqual(plotFormula(rows('3t+1')), { arg: 't' })
  assert.deepEqual(plotFormula(rows('y=5')), { arg: 'x', name: 'y' })
  assert.equal(plotFormula(rows('2+3')), null)
  assert.equal(plotFormula(rows('a+b')), null)
  assert.equal(plotFormula([{ t: 'int', x: [c('x')], v: [c('x')] }]), null)
})

const plane = (fns: GraphItem['fns']): GraphItem => ({
  type: 'graph', id: 'g', z: 1, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  kind: 'plane', xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false, fns
})

test('a curve is drawn only on its range', () => {
  const g = plane([{ expr: 'sqrt(x)', color: '#e03131', from: 3, to: 7 }])
  const xs = graphPrims(g).paths.flatMap((p) => p.pts.map(([x]) => x / 24))
  assert.ok(xs.length > 2)
  assert.ok(Math.min(...xs) >= 3 - 1e-9 && Math.max(...xs) <= 7 + 1e-9)
  assert.ok(Math.min(...xs) < 3.1 && Math.max(...xs) > 6.9)
  // A range outside the plane draws nothing.
  assert.equal(graphPrims(plane([{ expr: 'x', color: '#e03131', from: 20 }])).paths.length, 0)
})

test('axes are named after the functions', () => {
  assert.deepEqual(axisNames(plane([{ expr: 'x', color: '#000' }])), { h: 'x', v: 'y' })
  assert.deepEqual(axisNames(plane([{ expr: 'x', color: '#000', rows: rows('t'), name: 's', arg: 't' }])), { h: 't', v: 's' })
  assert.deepEqual(axisNames(plane([{ expr: 'x', color: '#000', rows: rows('t'), name: 'f', arg: 't' }])), { h: 't', v: 'y' })
  assert.deepEqual(
    axisNames(plane([{ expr: 'x', color: '#000', name: 's' }, { expr: 'x', color: '#000', name: 'v' }])),
    { h: 'x', v: 'y' }
  )
  const texts = graphPrims(plane([{ expr: 'x', color: '#000', rows: rows('t'), name: 's', arg: 't' }])).texts.map((t) => t.s)
  assert.ok(texts.includes('t') && texts.includes('s'))
})

test('a new variable is written into the formula', () => {
  const show = (r: Row): string => rowsToText(r, 't')
  const r = rows('x^2 +3x')
  assert.equal(show(renameVar(r, 'x', 't')), 'x^2+3*x')
  // Letters of a typed name stay; nothing to rename gives the same rows back.
  const e = [c('e'), c('x'), c('p'), { t: 'fence', k: 'paren', x: [c('x')] } as Atom]
  const renamed = renameVar(e, 'x', 't')
  assert.equal(renamed[1].t === 'c' && renamed[1].s, 'x')
  const inner = renamed[3]
  assert.ok(inner.t === 'fence' && inner.x[0].t === 'c' && inner.x[0].s === 't')
  const plain = rows('2+3')
  assert.equal(renameVar(plain, 'x', 't'), plain)
})

test('a curve is drawn only where its value is in range, and that needs version 7', async () => {
  const g = plane([{ expr: 'x^2', color: '#e03131', yFrom: 1, yTo: 4 }])
  const ys = graphPrims(g).paths.flatMap((p) => p.pts.map(([, y]) => -y / 24))
  assert.ok(ys.length > 2)
  assert.ok(Math.min(...ys) >= 1 - 1e-6 && Math.max(...ys) <= 4 + 1e-6)
  // Two pieces: the parabola between 1 and 4 on both sides of the axis.
  assert.equal(graphPrims(g).paths.length, 2)
  const { serializeBoard, deserializeBoard } = await import('../src/board/engine/serialize.ts')
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })))
  assert.equal(file.version, 7)
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, g.fns)
  // Fitting keeps to the range of values.
  const { fitRanges } = await import('../src/board/engine/graph.ts')
  assert.deepEqual(fitRanges(g), { xMin: -3, xMax: 3, yMin: -1, yMax: 5 })
})
