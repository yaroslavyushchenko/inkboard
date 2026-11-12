// Sampling and clipping of plotted functions (engine/graph.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphSvg, plotCurve, sanitizeGraph } from '../src/renderer/src/engine/graph.ts'
import { parseExpr } from '../src/renderer/src/engine/mathexpr.ts'
import type { GraphItem } from '../src/renderer/src/engine/types.ts'

const STEP = 2 / 24

function plot(src: string, box = [-10, 10, -10, 10]): [number, number][][] {
  const r = parseExpr(src)
  assert.ok(r.ok)
  return plotCurve(r.fn, box[0], box[1], box[2], box[3], STEP)
}

/** No polyline may contain points on both sides of x = a (it would be drawn across the asymptote). */
function noPieceCrosses(pieces: [number, number][][], a: number): void {
  for (const p of pieces) {
    const left = p.some(([x]) => x < a - 1e-9)
    const right = p.some(([x]) => x > a + 1e-9)
    assert.ok(!(left && right), `a piece crosses x = ${a}`)
  }
}

function insideBox(pieces: [number, number][][], box = [-10, 10, -10, 10]): void {
  const e = 1e-9
  for (const p of pieces) for (const [x, y] of p) assert.ok(x >= box[0] - e && x <= box[1] + e && y >= box[2] - e && y <= box[3] + e, `(${x}, ${y}) outside`)
}

test('a parabola is one piece clipped to the plane', () => {
  const pieces = plot('x^2')
  assert.equal(pieces.length, 1)
  insideBox(pieces)
  const p = pieces[0]
  assert.ok(Math.abs(p[0][0] + Math.sqrt(10)) < 1e-3 && Math.abs(p[0][1] - 10) < 1e-9)
  assert.ok(Math.abs(p[p.length - 1][0] - Math.sqrt(10)) < 1e-3)
})

test('a straight line spans the plane edge to edge', () => {
  const pieces = plot('2x + 1')
  assert.equal(pieces.length, 1)
  const p = pieces[0]
  assert.ok(Math.abs(p[0][1] + 10) < 1e-9 && Math.abs(p[p.length - 1][1] - 10) < 1e-9)
})

test('1/x is not connected across the asymptote', () => {
  const pieces = plot('1/x')
  assert.equal(pieces.length, 2)
  noPieceCrosses(pieces, 0)
  insideBox(pieces)
})

test('1/(x - 0.3) breaks even when no sample hits the pole', () => {
  const pieces = plot('1/(x - 0.3)')
  assert.equal(pieces.length, 2)
  noPieceCrosses(pieces, 0.3)
})

test('tan(x) is broken at every asymptote in range', () => {
  const pieces = plot('tan(x)')
  for (let k = -3; k <= 2; k++) noPieceCrosses(pieces, Math.PI / 2 + k * Math.PI)
  assert.equal(pieces.length, 7)
  insideBox(pieces)
})

test('sqrt(x) starts exactly at the domain edge', () => {
  const pieces = plot('sqrt(x)')
  assert.equal(pieces.length, 1)
  const [x0, y0] = pieces[0][0]
  assert.ok(Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-3, `starts at (${x0}, ${y0})`)
})

test('a function outside the plane draws nothing; undefined everywhere draws nothing', () => {
  assert.equal(plot('x + 100').length, 0)
  assert.equal(plot('sqrt(-1 - x^2)').length, 0)
})

test('sin(1/x) finishes quickly', () => {
  const t0 = Date.now()
  plot('sin(1/x)')
  assert.ok(Date.now() - t0 < 2000)
})

test('sanitizeGraph keeps valid functions, drops junk, fixes colours, caps the count', () => {
  const base = sanitizeGraph({ kind: 'plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, unit: 24, labelStep: 1, grid: false })
  assert.equal(base.fns, undefined)
  const p = sanitizeGraph({
    ...base,
    fns: [
      { expr: ' x^2 ', color: '#123456' },
      { expr: '', color: '#000' },
      { expr: 'x', color: '"><script>' },
      null,
      { expr: 5 },
      ...Array.from({ length: 20 }, () => ({ expr: 'x', color: '#fff' }))
    ] as never
  })
  assert.equal(p.fns!.length, 8)
  assert.deepEqual(p.fns![0], { expr: 'x^2', color: '#123456' })
  assert.match(p.fns![1].color, /^#[0-9a-f]{6}$/i)
})

test('SVG of a plane with functions has one path per piece; raw formula text is never inlined', () => {
  const g: GraphItem = {
    ...sanitizeGraph({ kind: 'plane', xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false, hideFormulas: true, fns: [{ expr: '1/x', color: '#e03131' }, { expr: '<b>', color: '#1971c2' }] }),
    type: 'graph', id: 'g', z: 0, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  const svg = graphSvg(g)
  assert.equal(svg.match(/stroke="#e03131"/g)?.length, 2)
  assert.ok(!svg.includes('<b>') && !svg.includes('1/x'))
  // Number line / 3D axes ignore functions.
  assert.ok(!graphSvg({ ...g, kind: 'line' }).includes('#e03131'))
})
