// Feature flags (src/shared/features.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanOverrides,
  defaultFeatures,
  FEATURE_IDS,
  FEATURES,
  featuresFileText,
  parseFeaturesFile,
  resolveFeatures
} from '../src/shared/features.ts'

test('every flag has a boolean default and a description', () => {
  assert.ok(FEATURE_IDS.length > 0)
  for (const id of FEATURE_IDS) {
    assert.equal(typeof FEATURES[id].default, 'boolean', id)
    assert.ok(FEATURES[id].description.length > 0, id)
  }
})

test('experimental features are off by default', () => {
  const d = defaultFeatures()
  assert.equal(d.darkTheme, false)
  assert.equal(d.chalkboard, false)
})

test('a missing, empty or broken file gives the defaults', () => {
  assert.deepEqual(parseFeaturesFile(null), defaultFeatures())
  assert.deepEqual(parseFeaturesFile(''), defaultFeatures())
  assert.deepEqual(parseFeaturesFile('{ not json'), defaultFeatures())
  assert.deepEqual(parseFeaturesFile('[true]'), defaultFeatures())
  assert.deepEqual(parseFeaturesFile('null'), defaultFeatures())
  assert.deepEqual(parseFeaturesFile('42'), defaultFeatures())
})

test('valid overrides are applied', () => {
  const f = parseFeaturesFile('{ "darkTheme": true }')
  assert.equal(f.darkTheme, true)
  assert.equal(f.chalkboard, false)
})

test('unknown keys and non-boolean values are ignored', () => {
  const o = cleanOverrides({ darkTheme: 'yes', chalkboard: 1, nope: true, toString: true, __proto__: { darkTheme: true } })
  assert.deepEqual(o, {})
  const f = resolveFeatures({ chalkboard: true, darkTheme: null, somethingElse: false })
  assert.equal(f.chalkboard, true)
  assert.equal(f.darkTheme, false)
  assert.deepEqual(Object.keys(f).sort(), [...FEATURE_IDS].sort())
})

test('the file only stores choices that differ from the defaults and reads back the same', () => {
  const flags = { ...defaultFeatures(), darkTheme: true }
  const text = featuresFileText(flags)
  assert.deepEqual(JSON.parse(text), { darkTheme: true })
  assert.deepEqual(parseFeaturesFile(text), flags)
  assert.deepEqual(JSON.parse(featuresFileText(defaultFeatures())), {})
})
