import { panBy } from '@inkboard/core/camera'
import type { Gesture, Sample, ToolContext } from './types'

/** Drags the board: the hand tool, Space, the middle or right mouse button, one finger. */
export function beginPan(ctx: ToolContext, start: Sample): Gesture {
  let last = start
  return {
    move(samples) {
      const s = samples.at(-1)
      if (!s) return
      ctx.editor.setCamera(panBy(ctx.editor.camera, s.sx - last.sx, s.sy - last.sy))
      last = s
    },
    end() {}
  }
}
