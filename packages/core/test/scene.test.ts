// Undo history of live edits (engine/scene.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '../src/scene.ts'
import type { Item } from '../src/types.ts'

const text = (id: string, s: string): Item => ({ type: 'text', id, z: 1, x: 0, y: 0, text: s, size: 20, color: '#000', bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } })

test('merged replaces with the same key are one undo step', () => {
  const sc = new Scene()
  const a = text('t', 'a')
  sc.add([a])
  const b = text('t', 'ab')
  const c = text('t', 'abc')
  sc.replaceMerged([a], [b], 'k')
  sc.replaceMerged([b], [c], 'k')
  assert.equal((sc.getItems()[0] as { text: string }).text, 'abc')
  sc.undo()
  assert.equal((sc.getItems()[0] as { text: string }).text, 'a')
  sc.redo()
  assert.equal((sc.getItems()[0] as { text: string }).text, 'abc')
})

test('another change in between starts a new step', () => {
  const sc = new Scene()
  const a = text('t', 'a')
  sc.add([a])
  const b = text('t', 'b')
  sc.replaceMerged([a], [b], 'k')
  const moved = { ...b, x: 10 }
  sc.replace([b], [moved])
  const c = { ...moved, text: 'c' }
  sc.replaceMerged([moved], [c], 'k')
  sc.undo()
  assert.equal((sc.getItems()[0] as { text: string; x: number }).text, 'b')
  assert.equal((sc.getItems()[0] as { x: number }).x, 10)
})
