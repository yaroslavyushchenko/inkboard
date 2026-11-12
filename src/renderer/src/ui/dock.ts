import type { BBox, Camera } from '../engine/types'

const MARGIN = 16
/** Keep clear of the top toolbar (lower when a narrow window puts it on a second row). */
const topMin = (): number => Math.max(84, (document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0) + MARGIN)

/**
 * Where a floating card goes beside a board object (world bbox): to its right if it fits, else to its
 * left, else in the bottom-right corner of the window. Top follows the object, kept on screen.
 */
export function dockBeside(b: BBox, cam: Camera, panelW: number, height: number): { left: number; top: number } {
  const sx0 = (b.minX - cam.x) * cam.zoom
  const sx1 = (b.maxX - cam.x) * cam.zoom
  const sy0 = (b.minY - cam.y) * cam.zoom
  const W = window.innerWidth
  const H = window.innerHeight
  let left: number
  if (sx1 + MARGIN + panelW <= W - MARGIN) left = Math.max(MARGIN, sx1 + MARGIN)
  else if (sx0 - MARGIN - panelW >= MARGIN) left = Math.min(W - MARGIN - panelW, sx0 - MARGIN - panelW)
  else left = W - MARGIN - panelW
  const top = Math.max(topMin(), Math.min(sy0, H - MARGIN - height))
  return { left, top }
}
