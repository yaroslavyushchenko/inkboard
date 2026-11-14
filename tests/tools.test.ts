// Tool controllers (src/board/tools): eraser, brush select and laser, without a DOM. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '@inkboard/core/scene'
import type { ImageItem, Item, StrokeItem } from '@inkboard/core/types'
import { itemsTouched } from '../src/board/tools/brushSelect.ts'
import { beginErase, eraseAlong, eraseUnit, type EraseRecord } from '../src/board/tools/eraser.ts'
import { LASER_FADE_MS, LaserTrail } from '../src/board/tools/laser.ts'
import type { Sample, ToolContext } from '../src/board/tools/types.ts'

/** A straight horizontal stroke from (x0, y) to (x1, y), sampled every 5 units. */
function line(id: string, x0: number, x1: number, y: number, extra: Partial<StrokeItem> = {}): StrokeItem {
  const points: StrokeItem['points'] = []
  for (let x = x0; x <= x1; x += 5) points.push([x, y, 0.5])
  return {
    type: 'stroke', id, z: 1, tool: 'pen', color: '#000', size: 2, pressure: false, points,
    bbox: { minX: x0 - 1, minY: y - 1, maxX: x1 + 1, maxY: y + 1 }, ...extra
  }
}

const image = (id: string): ImageItem => ({
  type: 'image', id, z: 1, src: 'data:,', x: 0, y: -10, w: 100, h: 20, bbox: { minX: 0, minY: -10, maxX: 100, maxY: 10 }
})

const ids = (items: readonly Item[]) => items.map((i) => i.id).sort()
const record = (): EraseRecord => ({ removed: [], added: [] })

test('stroke eraser removes whole strokes it touches, never images or locked ink', () => {
  const sc = new Scene()
  sc.add([line('hit', 0, 100, 0), line('far', 0, 100, 200), line('locked', 0, 100, 0, { locked: true }), image('img')])
  const rec = record()
  eraseAlong(sc, 50, -20, 50, 20, 5, 'stroke', rec)
  assert.deepEqual(ids(sc.getItems()), ['far', 'img', 'locked'])
  assert.deepEqual(ids(rec.removed), ['hit'])
})

test('a fast swipe is sampled along its path and does not skip a stroke', () => {
  const sc = new Scene()
  sc.add([line('mid', 0, 100, 0)])
  const rec = record()
  // Starts and ends far from the line, crosses it in between.
  eraseAlong(sc, 50, -500, 50, 500, 5, 'stroke', rec)
  assert.equal(sc.getItems().length, 0)
})

test('point eraser cuts a stroke in two and records one undo step for the swipe', () => {
  const sc = new Scene()
  const orig = line('long', 0, 100, 0)
  sc.add([orig])
  const rec = record()
  eraseAlong(sc, 50, -20, 50, 20, 5, 'point', rec)
  const pieces = sc.getItems()
  assert.equal(pieces.length, 2)
  assert.deepEqual(ids(rec.removed), ['long'])
  assert.deepEqual(ids(rec.added), ids(pieces))
  // Cutting a piece made earlier in the same swipe replaces it in `added`, it isn't "removed".
  eraseAlong(sc, 20, -20, 20, 20, 5, 'point', rec)
  assert.deepEqual(ids(rec.removed), ['long'])
  assert.deepEqual(ids(rec.added), ids(sc.getItems()))
})

test('erasing one edge of a shape takes the whole shape, unless part of it is locked', () => {
  const spec = { kind: 'rectangle' as const, ax: 0, ay: 0, bx: 100, by: 100 }
  const a = line('a', 0, 100, 0, { shape: spec, groupId: 'g' })
  const b = line('b', 0, 100, 100, { shape: spec, groupId: 'g' })
  assert.deepEqual(ids(eraseUnit([a, b], a)), ['a', 'b'])
  assert.deepEqual(eraseUnit([a, { ...b, locked: true }], a), [])
})

test('an erase gesture becomes one undo step on release', () => {
  const sc = new Scene()
  sc.add([line('a', 0, 100, 0), line('b', 0, 100, 50)], false)
  const ctx = {
    scene: sc,
    editor: { camera: { x: 0, y: 0, zoom: 1 } },
    prefs: () => ({ eraserRadius: 5, eraserMode: 'stroke' }),
    invalidate: () => {}
  } as unknown as ToolContext
  const at = (x: number, y: number): Sample => ({ sx: x, sy: y, x, y, pressure: 0.5, time: 0 })
  const g = beginErase(ctx, at(50, -20))
  g.move([at(50, 10), at(50, 60)])
  assert.equal(sc.getItems().length, 0)
  assert.equal(sc.canUndo, false)
  g.end()
  assert.equal(sc.canUndo, true)
  sc.undo()
  assert.deepEqual(ids(sc.getItems()), ['a', 'b'])
})

test('brush select touches strokes along its path and images by their box', () => {
  const items = [line('near', 0, 100, 0), line('far', 0, 100, 300), image('img')]
  assert.deepEqual(ids(itemsTouched(items, -50, 3, 150, 3, 4)), ['img', 'near'])
  assert.deepEqual(ids(itemsTouched(items, -50, 290, 150, 290, 4)), [])
})

test('the laser trail fades out', () => {
  const trail = new LaserTrail()
  trail.add(0, 0, 0)
  trail.add(1, 1, 500)
  assert.equal(trail.prune(LASER_FADE_MS - 1), true)
  assert.equal(trail.points.length, 2)
  assert.equal(trail.prune(LASER_FADE_MS + 1), true)
  assert.equal(trail.points.length, 1)
  assert.equal(trail.prune(500 + LASER_FADE_MS), false)
})
