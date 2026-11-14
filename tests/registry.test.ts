// Feature modules and their registry (src/board/registry.ts, src/board/modules). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Point } from '@inkboard/core/types'
import { graphSvg } from '../src/board/engine/graph.ts'
import { builtinModules, formulasModule, graphsModule, shapeRecognitionModule, strokesModule } from '../src/board/modules/index.ts'
import { FeatureRegistry } from '../src/board/registry.ts'
import { sampleFormulas, sampleGraphs } from './fixtures/displaySamples.ts'

/** A rough hand-drawn circle of radius r around (0, 0). */
function roughCircle(r: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    const wobble = 1 + 0.03 * Math.sin(i * 1.7)
    pts.push([Math.cos(a) * r * wobble, Math.sin(a) * r * wobble, 0.5])
  }
  return pts
}

test('the built-in modules draw every item type and add both behaviours', () => {
  const reg = new FeatureRegistry(builtinModules)
  for (const id of ['ink', 'images', 'text', 'graphs', 'formulas', 'shape-recognition']) assert.ok(reg.has(id), id)
  assert.ok(reg.strokeRecognizer)
  assert.ok(reg.formulaEvaluator)
  // Exports go through the registry and match the item's own SVG.
  assert.equal(reg.svg(sampleGraphs[0]), graphSvg(sampleGraphs[0]))
  assert.match(reg.svg(sampleFormulas[0]), /^<g fill=/)
})

test('without the shape recognition module strokes are never snapped', () => {
  const reg = new FeatureRegistry([strokesModule, graphsModule])
  assert.equal(reg.strokeRecognizer, null)
  const withIt = new FeatureRegistry([strokesModule, shapeRecognitionModule])
  const shape = withIt.strokeRecognizer?.recognize(roughCircle(60), 12)
  assert.ok(shape?.spec, 'a rough circle becomes a board shape')
  assert.equal(shape?.spec?.kind, 'ellipse')
})

test('formula answers come from the formulas module', () => {
  const rows = sampleFormulas[0].rows.filter((a) => !(a.t === 'c' && a.s === 'x'))
  assert.equal(new FeatureRegistry([graphsModule]).formulaEvaluator, null)
  const result = new FeatureRegistry([formulasModule]).formulaEvaluator?.result(rows, false)
  assert.ok(result, 'a number is worked out')
})

test('an item type can only have one owner', () => {
  assert.throws(() => new FeatureRegistry([graphsModule, { id: 'other', items: { graph: { svg: () => '' } } }]), /registered twice/)
})

test('items whose module is missing are left out of exports, not broken', () => {
  const reg = new FeatureRegistry([strokesModule])
  assert.equal(reg.svg(sampleGraphs[0]), '')
})
