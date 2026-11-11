/** A sampled input point in world coordinates: x, y and pen pressure (0..1). */
export type Point = [x: number, y: number, pressure: number]

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface ItemBase {
  id: string
  /** Stacking order. Higher is drawn on top. Preserved across undo/redo. */
  z: number
  bbox: BBox
}

/**
 * Ink is stored as vector data (the raw points), never as pixels.
 * The outline is rebuilt for the current zoom on every render, so strokes stay sharp at any scale.
 */
export interface StrokeItem extends ItemBase {
  type: 'stroke'
  tool: 'pen' | 'highlighter'
  color: string
  /** Base width in world units. */
  size: number
  /** true when the points carry real pen pressure (stylus); false for mouse / touch. */
  pressure: boolean
  points: Point[]
}

/** A raster image placed on the board. Kept at its original resolution. */
export interface ImageItem extends ItemBase {
  type: 'image'
  src: string
  x: number
  y: number
  w: number
  h: number
}

export type Item = StrokeItem | ImageItem

export type BackgroundKind = 'blank' | 'dots' | 'grid' | 'lines'

export interface Camera {
  /** World coordinate at the top-left corner of the viewport. */
  x: number
  y: number
  zoom: number
}
