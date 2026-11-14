// Sample graphs and formulas for tests/display.test.ts (shared with the script that made the fixture).
import { graphBBox, sanitizeGraph } from '../../src/board/engine/graph.ts'
import type { FormulaItem, GraphItem, GraphParams } from '@inkboard/core/types'
import { typeChar, insertFraction, EMPTY_FORMULA, type FormulaState } from '@inkboard/math/formula'

function graph(id: string, p: GraphParams, color = '#1e1e1e'): GraphItem {
  const g: GraphItem = { ...sanitizeGraph(p), type: 'graph', id, z: 1, ox: 10, oy: 20, color, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  g.bbox = graphBBox(g)
  return g
}

export const sampleGraphs: GraphItem[] = [
  graph('plane', { kind: 'plane', xMin: -5, xMax: 5, yMin: -3, yMax: 5, unit: 24, labelStep: 1, grid: false, fns: [{ expr: 'x^2 / 4 - 2', color: '#435bdb' }] }),
  graph('grid', { kind: 'plane', xMin: -3, xMax: 3, yMin: -3, yMax: 3, unit: 30, labelStep: 1, grid: true, fns: [{ expr: 'sin(x)', color: '#e03131' }, { expr: 'x/2 + 1', color: '#2f9e44' }] }),
  graph('line', { kind: 'line', xMin: -4, xMax: 4, yMin: 0, yMax: 0, unit: 32, labelStep: 1, grid: false, fns: [] }, '#5c5f66'),
  graph('space', { kind: 'space', xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -3, zMax: 3, unit: 24, labelStep: 1, grid: false })
]

function typed(s: string, st: FormulaState = EMPTY_FORMULA): FormulaState {
  for (const ch of s) st = typeChar(st, ch)
  return st
}

export const sampleFormulas: FormulaItem[] = [
  { type: 'formula', id: 'f1', z: 1, x: 5, y: 7, size: 32, color: '#1e1e1e', rows: typed('3+4x').rows, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
  { type: 'formula', id: 'f2', z: 1, x: 0, y: 0, size: 24, color: '#e03131', rows: typed('2', insertFraction(typed('1+'))).rows, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
]
