import { bboxIntersects, circleHitsPolyline } from '@inkboard/core/geometry'
import type { Item } from '@inkboard/core/types'
import type { Gesture, Modifiers, Sample, ToolContext } from './types'

/** Items a circle of radius r touches while it moves from (x0, y0) to (x1, y1) on the board. */
export function itemsTouched(items: readonly Item[], x0: number, y0: number, x1: number, y1: number, r: number): Item[] {
  const box = { minX: Math.min(x0, x1) - r, minY: Math.min(y0, y1) - r, maxX: Math.max(x0, x1) + r, maxY: Math.max(y0, y1) + r }
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.5)))
  const hit: Item[] = []
  for (const item of items) {
    if (!bboxIntersects(item.bbox, box)) continue
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const cx = x0 + (x1 - x0) * t
      const cy = y0 + (y1 - y0) * t
      const touches =
        item.type === 'stroke'
          ? circleHitsPolyline(cx, cy, r + item.size / 2, item.points)
          : cx + r >= item.bbox.minX && cx - r <= item.bbox.maxX && cy + r >= item.bbox.minY && cy - r <= item.bbox.maxY
      if (touches) {
        hit.push(item)
        break
      }
    }
  }
  return hit
}

/** A pointer that moves less than this (screen px) is a tap. */
const TAP_SLOP = 4

/**
 * Brush select: everything the circle touches is added to the selection (whole groups), or removed
 * from it with Ctrl / Alt held. A tap that touches nothing clears the selection.
 */
export function beginBrushSelect(ctx: ToolContext, start: Sample, mods: Modifiers): Gesture {
  const { editor, scene, session } = ctx
  const remove = mods.ctrl || mods.alt
  let touched = false
  let moved = false
  let last = start

  const brush = (x0: number, y0: number, x1: number, y1: number): void => {
    const r = ctx.prefs().selectRadius / editor.camera.zoom
    const hit = itemsTouched(scene.getItems(), x0, y0, x1, y1, r)
    if (!hit.length) return
    touched = true
    const current = editor.selectedItems()
    if (remove) {
      const gone = new Set<string>()
      for (const h of hit) {
        if (h.groupId) for (const m of scene.getItems()) if (m.groupId === h.groupId) gone.add(m.id)
        gone.add(h.id)
      }
      const next = current.filter((i) => !gone.has(i.id)).map((i) => i.id)
      if (next.length !== current.length) session.setState({ selectedIds: next })
    } else {
      const have = new Set(current.map((i) => i.id))
      const fresh = hit.filter((i) => !have.has(i.id))
      if (fresh.length) editor.setSelection([...current, ...fresh])
    }
  }

  brush(start.x, start.y, start.x, start.y)
  return {
    move(samples) {
      for (const s of samples) {
        if (Math.hypot(s.sx - start.sx, s.sy - start.sy) > TAP_SLOP) moved = true
        brush(last.x, last.y, s.x, s.y)
        last = s
      }
    },
    end() {
      if (!moved && !touched && !remove) editor.clearSelection()
    }
  }
}
