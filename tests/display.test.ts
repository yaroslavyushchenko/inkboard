// Display lists (@inkboard/render): graphs and formulas are drawn from one description on screen and
// in SVG exports. Run: npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PAPER, toSvg, type Prim } from '@inkboard/render/display'
import { graphDisplay, graphSvg } from '../src/board/engine/graph.ts'
import { formulaSvg } from '../src/board/engine/formulatype.ts'
import { withInkSurface } from '../src/board/engine/surface.ts'
import { sampleFormulas, sampleGraphs } from './fixtures/displaySamples.ts'

/**
 * SVG written by the code before display lists (tests/fixtures/display.svg.json). The new SVG must be
 * the same, except that attributes holding SVG's defaults are no longer written out.
 */
const before = JSON.parse(readFileSync(new URL('./fixtures/display.svg.json', import.meta.url), 'utf8')) as Record<string, string>
const withoutDefaults = (svg: string): string => svg.replaceAll(' text-anchor="start"', '').replaceAll(' dominant-baseline="alphabetic"', '')

for (const bg of ['dots', 'chalk-dots'] as const) {
  test(`graphs and formulas export the same SVG as before (${bg})`, () => {
    withInkSurface(bg, () => {
      for (const g of sampleGraphs) assert.equal(graphSvg(g), withoutDefaults(before[`graph:${g.id}:${bg}`]), `graph ${g.id}`)
      for (const f of sampleFormulas) assert.equal(formulaSvg(f), withoutDefaults(before[`formula:${f.id}:${bg}`]), `formula ${f.id}`)
    })
  })
}

test('a graph display list is built once per item and keeps item colours', () => {
  const g = sampleGraphs[0]
  assert.equal(graphDisplay(g), graphDisplay(g))
  const colours = new Set<string>()
  const walk = (p: Prim): void => {
    if (p.kind === 'group') p.children.forEach(walk)
    else if (p.kind === 'text') colours.add(p.halo ? p.halo.color : p.color ?? '')
    else colours.add(p.color)
  }
  walk(graphDisplay(g))
  // Surface colours are applied when drawing, so the cached list works on paper and chalkboard.
  assert.ok(colours.has('#435bdb'))
  assert.ok(colours.has(PAPER))
})

test('SVG text escapes markup and writes only non-default alignment', () => {
  const svg = toSvg({ kind: 'text', s: 'a<b & "c"', x: 1, y: 2, size: 10, family: 'serif', align: 'center', baseline: 'alphabetic', color: '#000' }, (c) => c)
  assert.equal(svg, `<text x="1" y="2" font-size="10" font-family='serif' text-anchor="middle" fill="#000">a&lt;b &amp; &quot;c&quot;</text>`)
})
