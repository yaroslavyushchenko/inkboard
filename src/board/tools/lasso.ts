import { hitTest, itemsInLasso } from '../engine/transform'
import type { Gesture, Sample, ToolContext } from './types'

/** A pointer that moves less than this (screen px) is a tap. */
const TAP_SLOP = 4

/**
 * Lasso select: draw around items to select them. A tap selects the item under the pointer, or
 * clears the selection on empty board. (Grabbing the selection or an item under the pointer is
 * decided before a lasso starts, by the select tool in ui/Board.tsx.)
 */
export function beginLasso(ctx: ToolContext, start: Sample): Gesture {
  const { editor, scene } = ctx
  const points: [number, number][] = [[start.x, start.y]]
  let moved = false
  return {
    move(samples) {
      for (const s of samples) {
        points.push([s.x, s.y])
        if (Math.hypot(s.sx - start.sx, s.sy - start.sy) > TAP_SLOP) moved = true
      }
    },
    end() {
      if (moved) return editor.setSelection(itemsInLasso(scene.getItems(), points))
      const hit = hitTest(scene.getItems(), start.x, start.y, 6 / editor.camera.zoom)
      if (hit) editor.setSelection([hit])
      else editor.clearSelection()
    },
    overlay: () => ({ lasso: points })
  }
}
