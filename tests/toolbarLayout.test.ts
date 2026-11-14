// Saved toolbar layouts (src/board/toolbarLayout.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanToolbarLayout, DEFAULT_TOOLBAR } from '../src/board/toolbarLayout.ts'

test('instruments share one dropdown button', () => {
  assert.ok(DEFAULT_TOOLBAR.some((id) => id === 'instruments'))
  assert.ok(!DEFAULT_TOOLBAR.some((id) => id === 'ruler' || id === 'compass'))
})

test('a layout saved with one button per instrument gets the dropdown in their place', () => {
  const saved = ['pen1', 'ruler', 'square45', 'divider:a', 'protractor', 'compass', 'undo']
  assert.deepEqual(cleanToolbarLayout(saved), ['pen1', 'instruments', 'divider:a', 'undo'])
})

test('unknown ids are dropped', () => {
  assert.deepEqual(cleanToolbarLayout(['pen1', 'nope', 42]), ['pen1'])
  assert.equal(cleanToolbarLayout('pen1'), null)
})
