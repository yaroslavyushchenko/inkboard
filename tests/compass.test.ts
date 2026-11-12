// On-board compass helpers (engine/compass.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMPASS_CELL, hitCompass, pencilAt, radiusFromHandle, radiusTicks, snapSweep, type Compass } from '../src/renderer/src/engine/compass.ts'

const Q = Math.PI / 2
const deg = (d: number): number => (d * Math.PI) / 180

test('arc sweep snaps to quarter, half and full turns when close', () => {
  // r = 96 world px at zoom 1: 2 degrees is about 3.4 px along the arc, so it snaps.
  assert.equal(snapSweep(deg(88), 96, 1), Q)
  assert.equal(snapSweep(deg(181), 96, 1), 2 * Q)
  assert.equal(snapSweep(deg(358), 96, 1), 4 * Q)
  assert.equal(snapSweep(deg(-92), 96, 1), -Q)
  assert.equal(snapSweep(deg(-360), 96, 1), -4 * Q)
})

test('arc sweep is left alone away from quarter turns and near zero', () => {
  assert.equal(snapSweep(deg(60), 96, 1), deg(60))
  assert.equal(snapSweep(deg(80), 96, 1), deg(80))
  assert.equal(snapSweep(deg(1), 96, 1), deg(1))
  assert.equal(snapSweep(0, 96, 1), 0)
})

test('the snap distance is in screen px: big circles or zoom in snap within fewer degrees', () => {
  assert.equal(snapSweep(deg(86), 48, 1), Q)
  assert.notEqual(snapSweep(deg(86), 480, 1), Q)
  assert.notEqual(snapSweep(deg(86), 48, 10), Q)
})

test('radius ticks: whole and half cells, halves dropped when too dense', () => {
  const t = radiusTicks(COMPASS_CELL * 3, 1)
  assert.equal(t.length, 6)
  assert.deepEqual(t.map((x) => x.half), [true, false, true, false, true, false])
  assert.equal(t[5].d, COMPASS_CELL * 3)
  const dense = radiusTicks(COMPASS_CELL * 3, 0.4)
  assert.ok(dense.length === 3 && dense.every((x) => !x.half))
  assert.deepEqual(radiusTicks(COMPASS_CELL * 3, 0.1), [])
})

test('hit testing finds the pencil, the needle and the radius handle', () => {
  const c: Compass = { x: 0, y: 0, r: 96, a: 0 }
  const p = pencilAt(c)
  assert.equal(hitCompass(c, p.x, p.y, 1), 'pencil')
  assert.equal(hitCompass(c, 0, 0, 1), 'needle')
  assert.equal(hitCompass(c, 96 + 34, 0, 1), 'radius')
  assert.equal(hitCompass(c, 48, 200, 1), null)
})

test('radius snaps to whole and half cells, never below half a cell', () => {
  const c: Compass = { x: 0, y: 0, r: 96, a: 0 }
  // Handle 34 px beyond the pencil.
  assert.equal(radiusFromHandle(c, COMPASS_CELL * 3.3 + 34, 0, 1).r, COMPASS_CELL * 3.5)
  assert.equal(radiusFromHandle(c, COMPASS_CELL * 2.9 + 34, 0, 1).r, COMPASS_CELL * 3)
  assert.equal(radiusFromHandle(c, 40, 0, 1).r, COMPASS_CELL / 2)
})
