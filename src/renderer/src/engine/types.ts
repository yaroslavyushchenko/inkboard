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
  /** Items sharing a groupId are selected, moved and scaled together (Ctrl+G). */
  groupId?: string
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
  /**
   * 'line' = drawn exactly through the points with a uniform width and crisp corners
   * (Shift straight lines and shapes). Absent = freehand ink.
   */
  geom?: 'line'
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

/**
 * A coordinate line (number line) or coordinate plane. Stored as parameters, drawn procedurally,
 * so it stays vector-sharp and can be re-configured after insertion.
 */
export interface GraphParams {
  kind: 'line' | 'plane'
  xMin: number
  xMax: number
  /** Plane only. */
  yMin: number
  yMax: number
  /** Board units per 1 on the axis (24 = one dot-paper cell). */
  unit: number
  /** Number labels every N units. */
  labelStep: number
  /** Kept for file compatibility; always false (the paper background is the grid). */
  grid: boolean
}

export interface GraphItem extends ItemBase, GraphParams {
  type: 'graph'
  /** World position of the origin (0, 0). */
  ox: number
  oy: number
  color: string
}

export type Item = StrokeItem | ImageItem | GraphItem

export type BackgroundKind = 'blank' | 'dots' | 'grid' | 'lines'

export interface Camera {
  /** World coordinate at the top-left corner of the viewport. */
  x: number
  y: number
  zoom: number
}
