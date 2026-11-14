import type { StrokeItem } from '@inkboard/core/types'
import { capsSvg, dashPattern, drawStroke, HIGHLIGHTER_ALPHA, inkOutlineSvg, lineSvgPath, usesLineRender } from '../engine/ink'
import { highlightBlend, inkColor } from '../engine/surface'
import type { FeatureModule } from '../registry'

const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** A stroke as SVG: freehand ink as its filled outline, straight and dashed lines as a stroked path. */
function strokeSvg(it: StrokeItem): string {
  if (usesLineRender(it)) {
    const hl = it.tool === 'highlighter' ? ` stroke-opacity="${HIGHLIGHTER_ALPHA}" style="mix-blend-mode:${highlightBlend()}"` : ''
    const dash = it.dash ? ` stroke-dasharray="${dashPattern(it.dash, it.size).map(r2).join(' ')}"` : ''
    return (
      `<path d="${lineSvgPath(it.points)}" fill="none" stroke="${esc(inkColor(it.color))}" stroke-width="${r2(it.size)}" stroke-linecap="round" stroke-linejoin="round"${dash}${hl}/>` +
      capsSvg(it)
    )
  }
  const d = inkOutlineSvg(it)
  if (!d) return ''
  const hl = it.tool === 'highlighter' ? ` fill-opacity="${HIGHLIGHTER_ALPHA}" style="mix-blend-mode:${highlightBlend()}"` : ''
  return `<path d="${d}" fill="${esc(inkColor(it.color))}"${hl}/>`
}

/** Pen and highlighter ink: pressure strokes, straight lines, shapes and their line ends. */
export const strokesModule: FeatureModule = {
  id: 'ink',
  items: { stroke: { draw: (ctx, it) => drawStroke(ctx as CanvasRenderingContext2D, it), svg: strokeSvg } }
}
