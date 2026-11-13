// Board surfaces: paper and chalkboard (engine/surface.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bgPattern,
  CHALK_WHITE,
  chalkColor,
  CHALKBOARD_COLOR,
  inkColor,
  inkPaper,
  isBackgroundKind,
  isChalk,
  luminance,
  PAPER_COLOR,
  surfaceColor,
  withInkSurface,
  withPattern,
  withSurface
} from '../src/renderer/src/engine/surface.ts'

const lum = (c: string): number => luminance([1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))

test('background values combine a surface and a pattern', () => {
  assert.equal(isChalk('grid'), false)
  assert.equal(isChalk('chalk-grid'), true)
  assert.equal(bgPattern('chalk-lines'), 'lines')
  assert.equal(bgPattern('dots'), 'dots')
  assert.equal(withSurface('grid', true), 'chalk-grid')
  assert.equal(withSurface('chalk-grid', false), 'grid')
  assert.equal(withPattern('chalk-grid', 'dots'), 'chalk-dots')
  assert.equal(withPattern('grid', 'blank'), 'blank')
  assert.equal(surfaceColor('blank'), PAPER_COLOR)
  assert.equal(surfaceColor('chalk-blank'), CHALKBOARD_COLOR)
})

test('only known backgrounds are accepted', () => {
  for (const ok of ['blank', 'dots', 'grid', 'lines', 'chalk-blank', 'chalk-dots', 'chalk-grid', 'chalk-lines']) assert.ok(isBackgroundKind(ok), ok)
  for (const bad of ['', 'chalk', 'chalk-', 'chalk-chalk-grid', 'Grid', 42, null, undefined]) assert.equal(isBackgroundKind(bad), false, String(bad))
})

test('the default black ink becomes chalk white; light colours stay as they are', () => {
  assert.equal(chalkColor('#1e1e1e'), CHALK_WHITE)
  assert.equal(chalkColor('#000'), CHALK_WHITE)
  assert.equal(chalkColor('#ffffff'), '#ffffff')
  assert.equal(chalkColor('#ffe066'), '#ffe066')
  assert.equal(chalkColor('not-a-colour'), 'not-a-colour')
})

test('every dark pen colour is shown light enough to read on the chalkboard', () => {
  const board = luminance([0x2f, 0x4a, 0x3d])
  for (const c of ['#5c5f66', '#e03131', '#1971c2', '#6741d9', '#c2255c', '#8d5524', '#0c8599']) {
    const shown = chalkColor(c)
    const contrast = (lum(shown) + 0.05) / (board + 0.05)
    assert.ok(contrast >= 2.5, `${c} → ${shown} contrast ${contrast.toFixed(2)}`)
  }
})

test('ink colours only change while drawing on the chalkboard', () => {
  assert.equal(inkColor('#1e1e1e'), '#1e1e1e')
  assert.equal(inkPaper(), PAPER_COLOR)
  assert.equal(withInkSurface('chalk-grid', () => inkColor('#1e1e1e')), CHALK_WHITE)
  assert.equal(withInkSurface('chalk-grid', () => inkPaper()), CHALKBOARD_COLOR)
  assert.equal(withInkSurface('grid', () => inkColor('#1e1e1e')), '#1e1e1e')
  // Restored afterwards, even if drawing throws.
  assert.throws(() => withInkSurface('chalk-dots', () => { throw new Error('x') }))
  assert.equal(inkColor('#1e1e1e'), '#1e1e1e')
})
