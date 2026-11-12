// .inkboard file format round-trips (engine/serialize.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deserializeBoard, FORMAT_VERSION, serializeBoard, type BoardFile } from '../src/renderer/src/engine/serialize.ts'
import type { GraphItem } from '../src/renderer/src/engine/types.ts'

const plane = {
  type: 'graph' as const, id: 'g1', z: 1, ox: 240, oy: 240, color: '#1e1e1e',
  kind: 'plane' as const, xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false
}

test('the format version is 6 and is written to files', () => {
  assert.equal(FORMAT_VERSION, 6)
  const f = serializeBoard({ items: [], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(f.version, 6)
})

test('a plane with functions survives save and load', () => {
  const g: GraphItem = { ...plane, hideFormulas: true, fns: [{ expr: 'x^2', color: '#e03131' }, { expr: 'sin(x)', color: '#1971c2' }], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  const back = deserializeBoard(file).items[0] as GraphItem
  assert.equal(back.type, 'graph')
  assert.deepEqual(back.fns, g.fns)
  assert.equal(back.hideFormulas, true)
  assert.equal(back.ox, 240)
  assert.ok(back.bbox.maxX > back.bbox.minX)
})

test('version 5 files (no functions) still load', () => {
  const file = { format: 'inkboard', version: 5, background: 'grid', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [plane] } as unknown as BoardFile
  const items = deserializeBoard(file).items
  assert.equal(items.length, 1)
  assert.equal((items[0] as GraphItem).fns, undefined)
})

test('malformed functions are dropped without losing the plane', () => {
  const file = {
    format: 'inkboard', version: 6, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {},
    items: [{ ...plane, fns: 'nope' }, { ...plane, id: 'g2', fns: [{ expr: 42 }, { expr: 'x', color: 'red;' }] }]
  } as unknown as BoardFile
  const items = deserializeBoard(file).items as GraphItem[]
  assert.equal(items.length, 2)
  assert.equal(items[0].fns, undefined)
  assert.equal(items[1].fns!.length, 1)
  assert.equal(items[1].fns![0].expr, 'x')
  assert.match(items[1].fns![0].color, /^#/)
})

test('files from a newer version are refused', () => {
  assert.throws(() => deserializeBoard({ format: 'inkboard', version: 7, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [] }))
})
