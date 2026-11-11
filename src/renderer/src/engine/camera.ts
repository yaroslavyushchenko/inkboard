import type { BBox, Camera } from './types'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 20

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y }
}

export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom }
}

/** Zoom so that the world point under screen point (sx, sy) stays fixed. */
export function zoomAt(cam: Camera, sx: number, sy: number, newZoom: number): Camera {
  const zoom = clampZoom(newZoom)
  const w = screenToWorld(cam, sx, sy)
  return { zoom, x: w.x - sx / zoom, y: w.y - sy / zoom }
}

export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom }
}

export function viewportBBox(cam: Camera, width: number, height: number): BBox {
  return { minX: cam.x, minY: cam.y, maxX: cam.x + width / cam.zoom, maxY: cam.y + height / cam.zoom }
}
