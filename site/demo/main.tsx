import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BoardWorkspace } from '../../src/board/BoardWorkspace'
import { editor, DEFAULT_CAMERA } from '../../src/board/editor'
import { graphBBox, sanitizeGraph } from '../../src/board/engine/graph'
import { buildShapeItems } from '../../src/board/engine/shapeItems'
import type { GraphItem } from '../../src/board/engine/types'
import { detectLanguage, type Lang } from '../../src/board/i18n'
import { useUI } from '../../src/board/store'
import '../../src/board/styles.css'

function setLanguage(lang: Lang) {
  document.documentElement.lang = lang
  useUI.getState().setLang(lang)
}

const lang = new URLSearchParams(location.search).get('lang')
setLanguage(lang === 'uk' || lang === 'en' ? lang : detectLanguage())
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'inkboard-demo-language') return
  if (event.data.lang === 'uk' || event.data.lang === 'en') setLanguage(event.data.lang)
})

const graph: GraphItem = {
  ...sanitizeGraph({
    kind: 'plane', xMin: -5, xMax: 5, yMin: -3, yMax: 5, unit: 24, labelStep: 1, grid: false,
    fns: [{ expr: 'x^2 / 4 - 2', color: '#435bdb' }]
  }),
  type: 'graph', id: 'demo-graph', z: 1, ox: 0, oy: 0, color: '#1e1e1e',
  bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}
graph.bbox = graphBBox(graph)
const pyramid = buildShapeItems(
  { kind: 'pyramid', base: 6, ax: 208, ay: -106, bx: 378, by: 66 },
  { tool: 'pen', color: '#0c8599', size: 3 },
  (index) => ({ id: 'demo-pyramid-' + index, z: index + 2 }),
  'demo-pyramid'
)
editor.loadData({ items: [graph, ...pyramid], camera: DEFAULT_CAMERA, background: 'dots' })
editor.fitToContent()

const initialVersion = editor.scene.version
let fittedCamera = editor.camera
window.addEventListener('resize', () => {
  if (editor.scene.version !== initialVersion || editor.camera !== fittedCamera) return
  editor.fitToContent()
  fittedCamera = editor.camera
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoardWorkspace fixedLanguage surfaceFollowsTheme />
  </StrictMode>
)
