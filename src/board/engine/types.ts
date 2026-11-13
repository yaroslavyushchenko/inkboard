import type { Row } from './formula'
import type { ShapeKind } from './shapes'

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
  /** Locked items can't be erased, deleted, moved, resized or restyled until unlocked. */
  locked?: boolean
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
  /** Line pattern (drawn along the centre line, uniform width). Absent = solid. */
  dash?: LineDash
  /** End decorations of straight lines. */
  startCap?: LineCap
  endCap?: LineCap
  /**
   * Set on strokes made by the shape tool (every part of a solid carries the same spec), so the shape
   * can be re-generated later: stretched, switched to another shape, or given another base.
   */
  shape?: ShapeSpec
}

/** Parameters a shape was generated from: kind, the dragged box (a → b) and the base of a solid. */
export interface ShapeSpec {
  kind: ShapeKind
  ax: number
  ay: number
  bx: number
  by: number
  /** Number of base sides for pyramids and prisms. */
  base?: number
}

export type LineDash = 'dashed' | 'dotted'
export type LineCap = 'arrow' | 'dot' | 'circle' | 'bar'

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
  /** 'space' = 3D axes (x towards the viewer, y to the right, z up), drawn in oblique projection. */
  kind: 'line' | 'plane' | 'space'
  xMin: number
  xMax: number
  /** Plane only. */
  yMin: number
  yMax: number
  /** 3D axes only. */
  zMin?: number
  zMax?: number
  /** Board units per 1 on the axis (24 = one dot-paper cell). */
  unit: number
  /** Number labels every N units. */
  labelStep: number
  /** Kept for file compatibility; always false (the paper background is the grid). */
  grid: boolean
  /** Functions y = f(x) plotted on a coordinate plane (drawn only when kind is 'plane'). */
  fns?: PlotFn[]
  /** true = don't write the formulas next to the curves (shown by default). */
  hideFormulas?: boolean
}

/** One plotted function: the formula as the teacher typed it (see engine/mathexpr.ts) and its colour. */
export interface PlotFn {
  expr: string
  color: string
  /**
   * The formula as built on the math keypad (engine/formula.ts), when it was. It is what gets
   * plotted and written next to the curve; `expr` then holds the same function as plain text for
   * versions without the keypad.
   */
  rows?: Row
  /** Name of the function as written next to it: f for f(x) = …; absent = y = …. */
  name?: string
  /** Its variable (t, a, φ…); absent = x. `expr` is always written in x. */
  arg?: string
  /** Drawn only for values of the variable from `from` to `to` (each optional). */
  from?: number
  to?: number
  /** Drawn only where its value (the vertical axis) is from `yFrom` to `yTo` (each optional). */
  yFrom?: number
  yTo?: number
}

export interface GraphItem extends ItemBase, GraphParams {
  type: 'graph'
  /** World position of the origin (0, 0). */
  ox: number
  oy: number
  color: string
}

/** Formatting of a piece of text; unset fields fall back to the text item's own colour / size. */
export interface TextFormat {
  color?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/** A piece of text with one formatting (may contain line breaks). */
export interface TextRun extends TextFormat {
  text: string
}

/**
 * Typed text. Position is the top-left corner; `size` is the font size in board units.
 * `runs` (optional) splits `text` into differently formatted pieces; their texts joined equal `text`.
 */
export interface TextItem extends ItemBase {
  type: 'text'
  x: number
  y: number
  text: string
  size: number
  color: string
  runs?: TextRun[]
}

/**
 * A formula built on the math keypad: fractions, roots, powers, integrals. Stored as its tree
 * (engine/formula.ts) and typeset when drawn, so it stays vector and can be edited again.
 * Position is the top-left corner; `size` is the font size in board units.
 */
export interface FormulaItem extends ItemBase {
  type: 'formula'
  x: number
  y: number
  size: number
  color: string
  rows: Row
}

export type Item = StrokeItem | ImageItem | GraphItem | TextItem | FormulaItem

/** Pattern printed on the board surface. */
export type PaperPattern = 'blank' | 'dots' | 'grid' | 'lines'
/** Pattern on white paper, or `chalk-<pattern>` on the green chalkboard (see engine/surface.ts). */
export type BackgroundKind = PaperPattern | `chalk-${PaperPattern}`

export interface Camera {
  /** World coordinate at the top-left corner of the viewport. */
  x: number
  y: number
  zoom: number
}
