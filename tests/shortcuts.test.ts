// Contract test for keyboard shortcuts. If this fails, a shortcut people rely on changed.
// Run: npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { matchShortcut, SHORTCUTS, type KeyLike } from '../src/renderer/src/shortcuts.ts'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods
})
const ctrl = (code: string, shift = false): KeyLike => key(code, { ctrlKey: true, shiftKey: shift })

/** The promised behaviour. Changing a line here = changing what users' fingers / ExpressKeys do. */
const CONTRACT: [KeyLike, string, 'app' | 'board'][] = [
  [ctrl('KeyZ'), 'undo', 'board'],
  [ctrl('KeyY'), 'redo', 'board'],
  [ctrl('KeyZ', true), 'redo', 'board'],
  [ctrl('KeyG'), 'group', 'board'],
  [ctrl('KeyG', true), 'ungroup', 'board'],
  [ctrl('KeyD'), 'duplicate', 'board'],
  [ctrl('KeyA'), 'selectAll', 'board'],
  [ctrl('KeyS'), 'save', 'board'],
  [ctrl('KeyS', true), 'saveAs', 'board'],
  [ctrl('KeyH'), 'home', 'board'],
  [ctrl('KeyN'), 'newBoard', 'board'],
  [ctrl('KeyN'), 'newBoard', 'app'],
  [ctrl('KeyO'), 'openFile', 'app'],
  [ctrl('Equal'), 'zoomIn', 'board'],
  [ctrl('Equal', true), 'zoomIn', 'board'],
  [ctrl('NumpadAdd'), 'zoomIn', 'board'],
  [ctrl('Minus'), 'zoomOut', 'board'],
  [ctrl('Digit0'), 'zoomReset', 'board'],
  [key('Delete'), 'delete', 'board'],
  [key('Backspace'), 'delete', 'board'],
  [key('Escape'), 'escape', 'board'],
  [key('Digit1'), 'pen1', 'board'],
  [key('Digit2'), 'pen2', 'board'],
  [key('Digit3'), 'pen3', 'board'],
  [key('KeyP'), 'pen', 'board'],
  [key('KeyH'), 'highlighter', 'board'],
  [key('KeyE'), 'eraser', 'board'],
  [key('KeyX'), 'swapEraser', 'board'],
  [key('KeyV'), 'lasso', 'board'],
  [key('KeyC'), 'brushSelect', 'board'],
  [key('KeyM'), 'move', 'board'],
  [key('KeyT'), 'protractor', 'board'],
  [key('KeyK'), 'compass', 'board']
]

test('every promised shortcut triggers its action', () => {
  for (const [ev, id, scope] of CONTRACT) {
    assert.equal(matchShortcut(ev, scope)?.id, id, `${JSON.stringify(ev)} in ${scope} should be ${id}`)
  }
})

test('works on any keyboard layout (matches the physical key, ignores the typed character)', () => {
  // On a Ukrainian layout Ctrl+Z types "я" — the event still has code "KeyZ".
  const ukrainian = { ...ctrl('KeyZ'), key: 'я' } as KeyLike
  assert.equal(matchShortcut(ukrainian, 'board')?.id, 'undo')
  const source = readFileSync(new URL('../src/renderer/src/shortcuts.ts', import.meta.url), 'utf8')
  assert.ok(!/\be\.key\b/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), 'shortcuts.ts must not match on e.key')
})

test('board-only shortcuts do nothing on the home screen', () => {
  assert.equal(matchShortcut(ctrl('KeyZ'), 'app'), null)
  assert.equal(matchShortcut(key('KeyE'), 'app'), null)
})

test('Alt combinations and unknown keys are ignored', () => {
  assert.equal(matchShortcut(key('KeyZ', { ctrlKey: true, altKey: true }), 'board'), null)
  assert.equal(matchShortcut(key('KeyQ'), 'board'), null)
})

test('no two shortcuts share the same key combination', () => {
  const seen = new Map<string, string>()
  for (const s of SHORTCUTS) {
    for (const code of s.codes) {
      const k = `${s.mod}|${s.shift}|${code}`
      const prev = seen.get(k)
      assert.ok(!prev || prev === s.id, `${k} is bound to both ${prev} and ${s.id}`)
      seen.set(k, s.id)
    }
  }
})

test('every shortcut is documented and translated', () => {
  const docs = readFileSync(new URL('../docs/SHORTCUTS.md', import.meta.url), 'utf8')
  const i18n = readFileSync(new URL('../src/renderer/src/i18n.ts', import.meta.url), 'utf8')
  for (const s of SHORTCUTS) {
    assert.ok(docs.includes(s.display), `docs/SHORTCUTS.md is missing ${s.display}`)
    const occurrences = i18n.split(`'${s.label}'`).length - 1 + (i18n.split(`"${s.label}"`).length - 1)
    assert.ok(occurrences >= 2, `${s.label} must be translated in English and Ukrainian`)
  }
})
