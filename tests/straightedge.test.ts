// On-board ruler and set squares (45° and 30°/60°). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CM,
  MM,
  cmText,
  edgeLength,
  edgeOf,
  edgePos,
  edgeStroke,
  geometry,
  hitStraightedge,
  rotateFromHandle,
  snapStraightedgeToGrid,
  toWorld,
  type Straightedge
} from '../src/renderer/src/engine/straightedge.ts'

const RULER: Straightedge = { kind: 'ruler', x: 0, y: 0, rot: 0, size: 10 * CM }
const SQ45: Straightedge = { kind: 'square45', x: 0, y: 0, rot: 0, size: 10 * CM }
const SQ60: Straightedge = { kind: 'square60', x: 0, y: 0, rot: 0, size: 10 * CM }

test('cmText formats centimetres in English and Ukrainian', () => {
  assert.equal(cmText(5 * CM, 'cm', false), '5 cm')
  assert.equal(cmText(5.3 * CM, 'cm', false), '5.3 cm')
  assert.equal(cmText(5.3 * CM, 'см', true), '5,3 см')
})

test('set square geometry has right-angle legs and correct 45° / 30°-60° ratios', () => {
  assert.equal(edgeLength(SQ45, 0), 10 * CM)
  assert.equal(edgeLength(SQ45, 1), 10 * CM)
  assert.ok(Math.abs(edgeLength(SQ45, 2) - 10 * CM * Math.SQRT2) < 1e-6)

  assert.equal(edgeLength(SQ60, 0), 10 * CM)
  assert.ok(Math.abs(edgeLength(SQ60, 1) - (10 * CM) / Math.sqrt(3)) < 1e-6)
  assert.ok(Math.abs(edgeLength(SQ60, 2) - (20 * CM) / Math.sqrt(3)) < 1e-6)
})

test('hitStraightedge finds edges, body, close and rotate handles', () => {
  const gR = geometry(RULER)
  assert.equal(hitStraightedge(RULER, 0, gR.edges[0].a.v, 1), 'edge0')
  assert.equal(hitStraightedge(RULER, 0, gR.edges[1].a.v, 1), 'edge1')
  assert.equal(hitStraightedge(RULER, 0, 0, 1), 'body')
  assert.equal(hitStraightedge(RULER, -5 * CM - 26, 0, 1), 'close')
  assert.equal(hitStraightedge(RULER, 5 * CM + 26, 0, 1), 'rotate')

  const gS = geometry(SQ45)
  assert.equal(edgeOf(hitStraightedge(SQ45, 0, gS.edges[0].a.v, 1)), 0)
  assert.equal(edgeOf(hitStraightedge(SQ45, gS.edges[1].a.u, 0, 1)), 1)
  assert.equal(hitStraightedge(SQ45, 0, 0, 1), 'body')
})

test('edgePos snaps to whole millimetres and edgeStroke stays on the edge', () => {
  const gR = geometry(RULER)
  const d = edgePos(RULER, 0, gR.edges[0].a.u + gR.edges[0].zero + 3.44 * CM, gR.edges[0].a.v)
  assert.ok(Math.abs(d - (gR.edges[0].zero + 34 * MM)) < 1e-6)
  const pts = edgeStroke(RULER, 0, 0, 4 * CM, 2)
  assert.equal(pts.length, 2)
  assert.ok(Math.abs(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) - 4 * CM) < 1e-6)
})

test('rotateFromHandle snaps length to whole centimetres and angle with Shift', () => {
  const next = rotateFromHandle(RULER, 400, 400, 1, true)
  assert.equal(next.size % CM, 0)
  assert.ok(Math.abs(next.rot - Math.PI / 4) < 1e-9)
})

test('snapStraightedgeToGrid snaps ruler 0 mark and set square 90° corner to grid cells', () => {
  const step = 24
  const r = snapStraightedgeToGrid({ ...RULER, x: 13.7, y: -19.2 }, step)
  const gR = geometry(r)
  const zeroMark = toWorld(r, gR.edges[0].a.u + gR.edges[0].zero, gR.edges[0].a.v)
  assert.ok(Math.abs(zeroMark.x % step) < 1e-9)
  assert.ok(Math.abs(zeroMark.y % step) < 1e-9)

  const sq = snapStraightedgeToGrid({ ...SQ45, x: 31.4, y: 8.9 }, step)
  const gS = geometry(sq)
  const corner = toWorld(sq, gS.verts[0].u, gS.verts[0].v)
  assert.ok(Math.abs(corner.x % step) < 1e-9)
  assert.ok(Math.abs(corner.y % step) < 1e-9)
})
