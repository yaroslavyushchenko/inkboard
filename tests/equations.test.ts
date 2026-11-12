// Equations in x and y drawn as curves (x² + y² = 4), and fitting a plane to its graphs. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_FORMULA, typeChar, type Row } from '../src/renderer/src/engine/formula.ts'
import { fnHead, isEquation, labelRows, numericResult, parseRows, plotFormula, readPlotRows, rowsToText } from '../src/renderer/src/engine/formulaexpr.ts'
import { fitRanges, graphPrims, plotImplicit } from '../src/renderer/src/engine/graph.ts'
import { serializeBoard } from '../src/renderer/src/engine/serialize.ts'
import type { GraphItem, PlotFn } from '../src/renderer/src/engine/types.ts'

const rows = (s: string): Row => [...s].reduce(typeChar, EMPTY_FORMULA).rows
const plane = (fns: PlotFn[], r = 10): GraphItem => ({
  type: 'graph', id: 'g', z: 1, ox: 0, oy: 0, color: '#000', kind: 'plane',
  xMin: -r, xMax: r, yMin: -r, yMax: r, unit: 24, labelStep: 1, grid: false, fns,
  bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
})
const fn = (s: string, extra: Partial<PlotFn> = {}): PlotFn => {
  const r = rows(s)
  return { expr: rowsToText(r), color: '#e03131', rows: r, ...extra }
}

test('an equation in x and y is read as two sides; a function head or a trailing = is not one', () => {
  const circle = rows('x^2 +y^2 =4')
  assert.ok(isEquation(circle))
  const p = parseRows(circle)
  assert.ok(p.ok && p.eq)
  if (p.ok) assert.equal(p.fn(2, 0), 0)
  assert.equal(rowsToText(circle), 'x^2+y^2=4')
  assert.deepEqual(readPlotRows(circle, 'x^2+y^2=4'), circle)
  assert.ok(!isEquation(rows('y =x^2')))
  assert.ok(!isEquation(rows('2 +3 =')))
  // y stays unknown outside an equation, and a sum still has its value.
  assert.ok(!parseRows(rows('y+1')).ok || plotFormula(rows('y+1'))?.arg === 'y')
  assert.equal(numericResult(rows('2 +3 ='))?.value, 5)
  // From the board: equations are plotted, with no function name; ones without x or y are not.
  assert.deepEqual(plotFormula(rows('x =3')), { arg: 'x' })
  assert.deepEqual(plotFormula(rows('y^2 =x')), { arg: 'x' })
  assert.equal(plotFormula(rows('3 =3')), null)
  assert.deepEqual(fnHead({ rows: circle, name: 's' }), { name: 'y', arg: 'x' })
  // Its label is the equation itself, with no `s(x) =` put before it.
  const named = { ...fn('x^2 +y^2 =4'), name: 's' }
  assert.equal(labelRows({ ...named, rows: named.rows! }), named.rows)
})

test('a circle is drawn as one closed curve on the radius', () => {
  const p = parseRows(rows('x^2 +y^2 =4'))
  assert.ok(p.ok)
  if (!p.ok) return
  const lines = plotImplicit(p.fn, -10, 10, -10, 10, 4 / 24)
  assert.equal(lines.length, 1)
  const l = lines[0]
  assert.deepEqual(l[0], l[l.length - 1])
  for (const [x, y] of l) assert.ok(Math.abs(Math.hypot(x, y) - 2) < 1e-6)
  // The plane draws it, and its label.
  const prims = graphPrims(plane([fn('x^2 +y^2 =4')]))
  assert.equal(prims.paths.length, 1)
  assert.ok(prims.texts.some((t) => t.s === '4'))
})

test('poles are left out of equations; lines and sideways parabolas are drawn', () => {
  const tan = parseRows(rows('y -tan(x) =0'))
  assert.ok(tan.ok)
  if (!tan.ok) return
  const pieces = plotImplicit(tan.fn, -10, 10, -10, 10, 4 / 24)
  // One branch per period of tan between -10 and 10, never a line across an asymptote.
  assert.equal(pieces.length, 7)
  for (const piece of pieces) for (const [x, y] of piece) assert.ok(Math.abs(y - Math.tan(x)) < 1e-3)
  const line = parseRows(rows('x =3'))
  assert.ok(line.ok)
  if (line.ok) for (const [x] of plotImplicit(line.fn, -10, 10, -10, 10, 4 / 24)[0]) assert.ok(Math.abs(x - 3) < 1e-9)
})

test('a board with an equation needs version 7', () => {
  const g = plane([fn('x^2 +y^2 =4')])
  assert.equal(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }).version, 7)
})

test('fitting a plane to its graphs: it grows as well as shrinks, and a second fit changes nothing', () => {
  const fit = (fns: PlotFn[], r = 10) => fitRanges(plane(fns, r))
  const circle = { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }
  // A circle of radius 2 on a large plane and on one too small for it.
  assert.deepEqual(fit([fn('x^2 +y^2 =4')]), circle)
  assert.deepEqual(fit([fn('x^2 +y^2 =4')], 1), circle)
  // A circle bigger than the plane.
  assert.deepEqual(fit([fn('x^2 +y^2 =36')], 5), { xMin: -7, xMax: 7, yMin: -7, yMax: 7 })
  // A parabola, the same whatever the plane was, and again after fitting.
  const parabola = { xMin: -4, xMax: 4, yMin: -1, yMax: 11 }
  for (const r of [1, 2, 10, 30]) assert.deepEqual(fit([fn('x^2')], r), parabola)
  const g = plane([fn('x^2')], 2)
  assert.deepEqual(fitRanges({ ...g, ...fitRanges(g)! }), parabola)
  // A function on a range: all of that piece, even outside the plane (√x from 3 to 7 lies between 1.7 and 2.7).
  assert.deepEqual(fit([{ ...fn('sqrt(x)'), from: 3, to: 7 }], 2), { xMin: -1, xMax: 8, yMin: -1, yMax: 4 })
  assert.deepEqual(fit([{ ...fn('x'), from: 0, to: 30 }], 5), { xMin: -1, xMax: 31, yMin: -1, yMax: 31 })
  // Far from the usual window: the plane the teacher set up is searched instead.
  assert.deepEqual(fit([fn('x +100')], 200), { xMin: -201, xMax: 101, yMin: -101, yMax: 201 })
  assert.equal(fit([]), null)
})

test('a left side typed by hand: x = y² is a sideways parabola, w(z) = … a function of z', () => {
  const side = parseRows(rows('x =y^2'))
  assert.ok(side.ok && side.eq)
  if (side.ok) assert.equal(side.fn(4, 2), 0)
  assert.deepEqual(plotFormula(rows('x =y^2')), { arg: 'x' })
  const w = rows('w(z) =z^2')
  assert.deepEqual(plotFormula(w), { arg: 'z', name: 'w' })
  const p = parseRows(w)
  assert.ok(p.ok)
  if (p.ok) assert.equal(p.fn(3), 9)
  // y alone is not a variable of a function: the panel then asks for an equation.
  const y = parseRows(rows('y^2'))
  assert.ok(!y.ok && y.code === 'unknownName' && y.detail === 'y')
})
