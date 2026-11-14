import { drawText, textSvg } from '../engine/text'
import type { FeatureModule } from '../registry'

/** Formatted text typed on the board. */
export const textModule: FeatureModule = {
  id: 'text',
  items: { text: { draw: drawText, svg: textSvg } }
}
