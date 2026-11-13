// .inkboard file format round-trips (engine/serialize.ts). Run: npm test
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { decodeBoard, deserializeBoard, encodeBoard, FORMAT_VERSION, serializeBoard, type BoardFile } from '../src/board/engine/serialize.ts'
import { EMPTY_FORMULA, typeChar } from '../src/board/engine/formula.ts'
import { rowsToText } from '../src/board/engine/formulaexpr.ts'
import type { FormulaItem, GraphItem } from '../src/board/engine/types.ts'

const plane = {
  type: 'graph' as const, id: 'g1', z: 1, ox: 240, oy: 240, color: '#1e1e1e',
  kind: 'plane' as const, xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false
}

test('the format version is 8; a board is stamped with the lowest version that can show it', () => {
  assert.equal(FORMAT_VERSION, 8)
  // Nothing from version 7 on the board: apps that only know version 6 can still open it.
  const f = serializeBoard({ items: [{ ...plane, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(f.version, 6)
})

test('a formula survives save and load and makes the file version 7', () => {
  const rows = [...'x^2/3'].reduce(typeChar, EMPTY_FORMULA).rows
  const item: FormulaItem = { type: 'formula', id: 'f1', z: 2, x: 10, y: 20, size: 32, color: '#e03131', rows, locked: true, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [item], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(file.version, 7)
  const back = deserializeBoard(file).items[0] as FormulaItem
  assert.equal(back.type, 'formula')
  assert.deepEqual(back.rows, rows)
  assert.equal(back.color, '#e03131')
  assert.equal(back.locked, true)
  assert.ok(back.bbox.minX === 10 && back.bbox.minY === 20 && back.bbox.maxX > 10 && back.bbox.maxY > 20)
})

test('a broken formula is dropped, the rest of the board loads', () => {
  const bad = { type: 'formula', id: 'f1', z: 2, x: 0, y: 0, size: 32, color: '#000', rows: [{ t: 'frac', n: 'oops' }] }
  const file = { format: 'inkboard', version: 7, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [bad, plane] } as unknown as BoardFile
  const items = deserializeBoard(file).items
  assert.equal(items.length, 1)
  assert.equal(items[0].type, 'graph')
})

test('a plotted function keeps its keypad formula; stale rows are dropped', () => {
  const rows = [...'x^2 +1'].reduce(typeChar, EMPTY_FORMULA).rows
  const fn = { expr: rowsToText(rows), color: '#e03131', rows }
  const g: GraphItem = { ...plane, fns: [fn], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  // Plots alone don't need a newer reader: older versions use the text.
  assert.equal(file.version, 6)
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [fn])
  // An older version edited the text and left the rows behind: the text wins.
  ;(file.items[0] as unknown as GraphItem).fns![0].expr = 'x^3'
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [{ expr: 'x^3', color: '#e03131' }])
})

test('a chalkboard background is saved as version 8 and reads back', () => {
  const f = JSON.parse(JSON.stringify(serializeBoard({ items: [], background: 'chalk-grid', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(f.version, 8)
  assert.equal(deserializeBoard(f).background, 'chalk-grid')
  assert.equal(deserializeBoard({ ...f, version: 7 }).background, 'chalk-grid')
})

test('a chalkboard with a formula preserves both the surface and the formula', () => {
  const rows = [...'x^2'].reduce(typeChar, EMPTY_FORMULA).rows
  const formula: FormulaItem = { type: 'formula', id: 'f1', z: 1, x: 10, y: 20, size: 32, color: '#1e1e1e', rows, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = serializeBoard({ items: [formula], background: 'chalk-grid', camera: { x: 0, y: 0, zoom: 1 } })
  const board = deserializeBoard(file)
  assert.equal(file.version, 8)
  assert.equal(board.background, 'chalk-grid')
  assert.deepEqual((board.items[0] as FormulaItem).rows, rows)
  assert.equal((board.items[0] as FormulaItem).color, formula.color)
})

test('unknown or missing backgrounds fall back to dots', () => {
  const base = { format: 'inkboard', version: 6, camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [] }
  assert.equal(deserializeBoard({ ...base, background: 'marble' } as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard({ ...base, background: 'chalk-marble' } as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard(base as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard({ ...base, background: 'lines' } as unknown as BoardFile).background, 'lines')
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
  assert.throws(() => deserializeBoard({ format: 'inkboard', version: FORMAT_VERSION + 1, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [] }))
})

test('encodeBoard writes plain UTF-8 JSON and decodeBoard accepts both plain JSON and legacy gzip', async () => {
  const g: GraphItem = { ...plane, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const bytes = await encodeBoard({ items: [g], background: 'grid', camera: { x: 10, y: 20, zoom: 1.5 } })
  // Not gzipped (starts with '{', not 0x1f 0x8b).
  assert.equal(bytes[0], '{'.charCodeAt(0))
  const fromPlain = await decodeBoard(bytes)
  assert.equal(fromPlain.background, 'grid')
  assert.equal(fromPlain.items.length, 1)

  // Legacy gzipped .inkboard files still decode cleanly.
  const gzipped = new Uint8Array(gzipSync(Buffer.from(bytes)))
  assert.equal(gzipped[0], 0x1f)
  assert.equal(gzipped[1], 0x8b)
  const fromGzip = await decodeBoard(gzipped)
  assert.equal(fromGzip.background, 'grid')
  assert.equal(fromGzip.items.length, 1)
})

test('a function drawn on a range keeps its range, name and variable, and needs version 7', () => {
  const rows = [...'3t+1'].reduce(typeChar, EMPTY_FORMULA).rows
  const fn = { expr: rowsToText(rows, 't'), color: '#e03131', rows, name: 's', arg: 't', from: 3, to: 7 }
  const g: GraphItem = { ...plane, fns: [fn], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(file.version, 7)
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [fn])
  // Name and variable alone change only how it is labelled: older versions may still open it.
  const named: GraphItem = { ...g, fns: [{ ...fn, from: undefined, to: undefined }] }
  delete named.fns![0].from
  delete named.fns![0].to
  assert.equal(serializeBoard({ items: [named], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }).version, 6)
  // A reversed range is put right; a variable without its keypad formula, or a bad name, is dropped.
  const bad = { ...plane, fns: [{ expr: 'x', color: '#e03131', from: 5, to: -2, arg: 't', name: 'xy' }] }
  const f2 = { format: 'inkboard', version: 7, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [bad] } as unknown as BoardFile
  assert.deepEqual((deserializeBoard(f2).items[0] as GraphItem).fns, [{ expr: 'x', color: '#e03131', from: -2, to: 5 }])
})
