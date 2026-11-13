import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitStroke } from '../src/board/engine/erase.ts'
import { autoBullet, continueList } from '../src/board/engine/lists.ts'
import { holdShape, perfectShape, recognizeShape } from '../src/board/engine/snapshape.ts'
import type { Point, StrokeItem } from '../src/board/engine/types.ts'

let n = 0
const id = (): string => `p${++n}`

const stroke = (points: Point[], extra: Partial<StrokeItem> = {}): StrokeItem => ({
  type: 'stroke', id: 's', z: 1, tool: 'pen', color: '#000', size: 2, pressure: false, points,
  bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ...extra
})

test('point eraser cuts a line in two and keeps line ends only where they survive', () => {
  const s = stroke([[0, 0, 0.5], [100, 0, 0.5]], { geom: 'line', startCap: 'arrow', endCap: 'dot' })
  const pieces = splitStroke(s, 50, 0, 50, 0, 5, id)!
  assert.equal(pieces.length, 2)
  assert.ok(pieces[0].points.at(-1)![0] < 45)
  assert.ok(pieces[1].points[0][0] > 55)
  assert.equal(pieces[0].startCap, 'arrow')
  assert.equal(pieces[0].endCap, undefined)
  assert.equal(pieces[1].endCap, 'dot')
  assert.equal(pieces[1].startCap, undefined)
  assert.notEqual(pieces[0].id, pieces[1].id)
})

test('point eraser leaves untouched strokes alone and can remove a stroke entirely', () => {
  const s = stroke([[0, 0, 0.5], [10, 0, 0.5]])
  assert.equal(splitStroke(s, 50, 50, 60, 60, 5, id), null)
  assert.deepEqual(splitStroke(s, 5, 0, 5, 0, 40, id), [])
})

test('pieces of a shape become plain lines', () => {
  const s = stroke([[0, 0, 0.5], [100, 0, 0.5]], { geom: 'line', groupId: 'g', shape: { kind: 'line', ax: 0, ay: 0, bx: 100, by: 0 } })
  for (const p of splitStroke(s, 50, 0, 50, 0, 5, id)!) {
    assert.equal(p.shape, undefined)
    assert.equal(p.groupId, undefined)
  }
})

const wobble = (i: number): number => Math.sin(i * 1.7) * 1.2
const circle = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 80 }, (_, i) => {
    const a = (i / 76) * Math.PI * 2
    return [cx + Math.cos(a) * (rx + wobble(i)), cy + Math.sin(a) * (ry + wobble(i)), 0.5] as Point
  })
const polyline = (corners: [number, number][], per = 20): Point[] => {
  const out: Point[] = []
  for (let k = 0; k < corners.length - 1; k++) {
    const [ax, ay] = corners[k]
    const [bx, by] = corners[k + 1]
    for (let i = 0; i < per; i++) out.push([ax + ((bx - ax) * i) / per + wobble(i + k), ay + ((by - ay) * i) / per + wobble(i * 3 + k), 0.5])
  }
  out.push([...corners.at(-1)!, 0.5])
  return out
}

test('lists continue on Enter and end on an empty item', () => {
  assert.deepEqual(continueList('• milk'), { next: '• ', exit: false })
  assert.deepEqual(continueList('- milk'), { next: '• ', exit: false })
  assert.deepEqual(continueList('  3. eggs'), { next: '  4. ', exit: false })
  assert.deepEqual(continueList('2) x'), { next: '3) ', exit: false })
  assert.deepEqual(continueList('• '), { next: '• ', exit: true })
  assert.equal(continueList('plain text'), null)
  assert.equal(continueList('3.14 is pi'), null)
  assert.equal(autoBullet('- '), '• ')
  assert.equal(autoBullet('  * '), '  • ')
  assert.equal(autoBullet('a - '), null)
})


test('a touchpad swipe is never split between zooming and scrolling', async () => {
  const { WheelSource, WHEEL_GESTURE_GAP } = await import('../src/board/engine/wheel.ts')
  const src = new WheelSource()
  // Two-finger swipe: small pixel steps, some purely vertical, some with a sideways part.
  const swipe = [[0, 4], [1, 6], [0, 9], [0, 7], [2, 5], [0, 3]].map(([dx, dy], i) =>
    src.isMouse({ deltaX: dx, deltaY: dy, deltaMode: 0, wheelDeltaY: -3 * dy, timeStamp: 1000 + i * 16 }))
  assert.ok(swipe.every((m) => !m))
  // A mouse wheel later: whole notches.
  const t = 1000 + 6 * 16 + WHEEL_GESTURE_GAP + 50
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120, timeStamp: t }), true)
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120, timeStamp: t + 30 }), true)
  // Firefox reports lines for a mouse wheel.
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 3, deltaMode: 1, timeStamp: t + 1000 }), true)
})

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const rect = polyline([[0, 0], [160, 0], [160, 90], [0, 90], [0, 0]])

test('snaps only to circle, oval, rectangle, square and triangles, all as board shapes', () => {
  assert.equal(recognizeShape(circle(100, 100, 60, 62))?.kind, 'circle')
  assert.equal(recognizeShape(circle(100, 100, 60, 62))?.spec?.kind, 'ellipse')
  assert.equal(recognizeShape(circle(100, 100, 120, 50))?.kind, 'ellipse')
  assert.equal(recognizeShape(rect)?.spec?.kind, 'rectangle')
  assert.equal(recognizeShape(polyline([[0, 0], [100, 0], [100, 96], [0, 96], [0, 0]]))?.kind, 'square')
  assert.equal(recognizeShape(polyline([[0, 100], [60, 0], [120, 100], [0, 100]]))?.spec?.kind, 'triangle')
  assert.equal(recognizeShape(polyline([[0, 0], [0, 100], [120, 100], [0, 0]]))?.spec?.kind, 'rightTriangle')
  // A tilted quadrilateral still becomes a level rectangle.
  assert.equal(recognizeShape(polyline([[20, 0], [160, 20], [140, 110], [0, 90], [20, 0]]))?.spec?.kind, 'rectangle')
})

test('an open curve on a circle becomes an arc; lines, zigzags, arrows and scribbles stay as drawn', () => {
  const arc: Point[] = Array.from({ length: 40 }, (_, i) => {
    const a = Math.PI + (i / 39) * Math.PI * 0.8
    return [100 + Math.cos(a) * 80 + wobble(i) * 0.5, 100 + Math.sin(a) * 80, 0.5]
  })
  assert.equal(recognizeShape(arc)?.kind, 'arc')
  assert.equal(recognizeShape(polyline([[0, 0], [200, 30]])), null)
  assert.equal(recognizeShape(polyline([[0, 100], [50, 0], [100, 100], [150, 0]])), null)
  assert.equal(recognizeShape(polyline([[0, 100], [200, 100], [170, 80], [200, 100], [170, 120]], 12)), null)
  const wave: Point[] = Array.from({ length: 40 }, (_, i) => [i * 5, Math.sin(i / 6) * 60, 0.5])
  assert.equal(recognizeShape(wave), null)
  // A pentagon is not one of the shapes.
  const penta: [number, number][] = Array.from({ length: 6 }, (_, i) => [100 + Math.cos((i / 5) * 2 * Math.PI - Math.PI / 2) * 80, 100 + Math.sin((i / 5) * 2 * Math.PI - Math.PI / 2) * 80])
  assert.notEqual(recognizeShape(polyline(penta))?.kind, 'rectangle')
})

test('dragging a held shape only resizes it around its centre: it stays a level board shape', () => {
  const r = recognizeShape(rect)!
  const [cx, cy] = r.pivot
  const big = holdShape(r, [cx + 10, cy], [cx, cy + 20])
  assert.equal(big.spec?.kind, 'rectangle')
  assert.ok(close(big.spec!.bx - big.spec!.ax, (r.spec!.bx - r.spec!.ax) * 2) && close(big.spec!.by - big.spec!.ay, (r.spec!.by - r.spec!.ay) * 2))
  assert.ok(close((big.spec!.ax + big.spec!.bx) / 2, cx))
})

test('perfect: rectangle becomes a square, oval a circle, triangle equilateral', () => {
  const sq = perfectShape(recognizeShape(rect)!)
  assert.equal(sq.kind, 'square')
  assert.ok(close(sq.spec!.bx - sq.spec!.ax, sq.spec!.by - sq.spec!.ay))
  const c = perfectShape(recognizeShape(circle(100, 100, 120, 50))!)
  assert.equal(c.kind, 'circle')
  assert.ok(close(c.spec!.bx - c.spec!.ax, c.spec!.by - c.spec!.ay))
  const t = perfectShape(recognizeShape(polyline([[0, 100], [60, 0], [120, 100], [0, 100]]))!).spec!
  assert.ok(close(t.by - t.ay, ((t.bx - t.ax) * Math.sqrt(3)) / 2))
})

