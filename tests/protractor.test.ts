// On-board protractor helpers and instrument preferences. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanInstrumentPrefs, DEFAULT_INSTRUMENTS } from '../src/board/engine/instruments.ts'
import { degText, hitProtractor, scaleAngle, snapDeg, toWorld, type Protractor } from '../src/board/engine/protractor.ts'

const P: Protractor = { x: 0, y: 0, r: 200, rot: 0 }
/** World point at scale angle `deg`, distance `d` from the centre. */
const at = (deg: number, d: number): { x: number; y: number } => {
  const a = (deg * Math.PI) / 180
  return toWorld(P, Math.cos(a) * d, -Math.sin(a) * d)
}

test('snapDeg rounds to the step, step 0 leaves the angle alone', () => {
  assert.equal(snapDeg(29, 5), 30)
  assert.equal(snapDeg(61.4, 5), 60)
  assert.equal(snapDeg(37.4, 1), 37)
  assert.equal(snapDeg(52, 15), 45)
  assert.equal(snapDeg(37.4, 0), 37.4)
})

test('degText: whole degrees plain, others with one decimal', () => {
  assert.equal(degText(30), '30°')
  assert.equal(degText(37.44), '37.4°')
  assert.equal(degText(89.99), '90°')
})

test('scaleAngle reads the scale and clamps below the baseline', () => {
  const below = at(-30, 100)
  assert.equal(scaleAngle(P, below.x, below.y), 0)
  const belowLeft = at(-150, 100)
  assert.equal(scaleAngle(P, belowLeft.x, belowLeft.y), 180)
  const up = at(60, 100)
  assert.ok(Math.abs(scaleAngle(P, up.x, up.y) - 60) < 1e-9)
})

test('hitProtractor finds the parts, and nothing below the baseline', () => {
  const edge = at(45, 200)
  assert.equal(hitProtractor(P, edge.x, edge.y, 1), 'arc')
  assert.equal(hitProtractor(P, 0, 0, 1), 'center')
  assert.equal(hitProtractor(P, 100, 0, 1), 'base')
  const inside = at(100, 120)
  assert.equal(hitProtractor(P, inside.x, inside.y, 1), 'body')
  assert.equal(hitProtractor(P, -226, 0, 1), 'close')
  assert.equal(hitProtractor(P, -226, 34, 1), 'settings')
  assert.equal(hitProtractor(P, 226, 0, 1), 'rotate')
  const lowEdge = at(-60, 200)
  const lowIn = at(-100, 120)
  assert.equal(hitProtractor(P, lowEdge.x, lowEdge.y, 1), null)
  assert.equal(hitProtractor(P, lowIn.x, lowIn.y, 1), null)
})

test('instrument preferences: defaults for missing or bad values', () => {
  assert.deepEqual(cleanInstrumentPrefs(undefined), DEFAULT_INSTRUMENTS)
  assert.deepEqual(cleanInstrumentPrefs('x'), DEFAULT_INSTRUMENTS)
  assert.deepEqual(cleanInstrumentPrefs({ protStep: 7, protColor: 'red' }), DEFAULT_INSTRUMENTS)
  assert.deepEqual(cleanInstrumentPrefs({ protStep: 15 }), { protStep: 15 })
  assert.equal(cleanInstrumentPrefs({ protStep: 0 }).protStep, 0)
})
