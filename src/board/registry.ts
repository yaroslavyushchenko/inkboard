import type { Row } from '@inkboard/math/formula'
import type { Item, Point, ShapeSpec } from '@inkboard/core/types'
import { paint } from '@inkboard/render-canvas/paint'
import { toSvg, type Prim } from '@inkboard/render/display'
import type { NumericResult } from './engine/formulaexpr'
import { inkColors } from './engine/surface'

/**
 * Feature modules (docs/ARCHITECTURE.md). The board's core knows item types and hooks only through
 * this registry: a module brings how its items are drawn and the behaviour it adds (recognising
 * shapes in strokes, working out formulas). The app picks the modules when it creates an editor
 * (`createEditor({ modules })`); src/board/modules has the built-in ones.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type ItemOf<K extends Item['type']> = Extract<Item, { type: K }>

/** How one kind of board item is drawn: as a display list, or (not converted yet) by its own code. */
export interface ItemKind<T extends Item = Item> {
  display?: (item: T) => Prim
  draw?: (ctx: Ctx, item: T) => void
  svg?: (item: T) => string
}

/** A clean shape found in a stroke: its outline, and the board shape it is (if it is one). */
export interface RecognizedShape {
  points: Point[]
  spec?: ShapeSpec
}

/** Hold-to-snap: turns a stroke held still at its end into the clean shape it resembles. */
export interface StrokeRecognizer {
  /** null when the stroke looks like no known shape (or is smaller than `minSize` board units). */
  recognize(points: readonly Point[], minSize: number): RecognizedShape | null
  /** The recognised shape stretched so that `from` follows the pen to `to`; `perfect` = square, circle… */
  reshape(base: RecognizedShape, from: readonly [number, number], to: readonly [number, number], perfect: boolean): RecognizedShape
}

/** Works out the value of a formula as it is typed (shown as "= 1.25" next to it). */
export interface FormulaEvaluator {
  result(rows: Row, comma: boolean): NumericResult | null
}

export interface FeatureModule {
  id: string
  items?: { [K in Item['type']]?: ItemKind<ItemOf<K>> }
  strokeRecognizer?: StrokeRecognizer
  formulaEvaluator?: FormulaEvaluator
}

export class FeatureRegistry {
  readonly strokeRecognizer: StrokeRecognizer | null = null
  readonly formulaEvaluator: FormulaEvaluator | null = null
  readonly modules: readonly FeatureModule[]
  private readonly kinds = new Map<string, ItemKind>()

  constructor(modules: readonly FeatureModule[]) {
    this.modules = modules
    for (const m of modules) {
      for (const [type, kind] of Object.entries(m.items ?? {})) {
        if (this.kinds.has(type)) throw new Error(`Item type "${type}" is registered twice (module ${m.id})`)
        this.kinds.set(type, kind as ItemKind)
      }
      if (m.strokeRecognizer) this.strokeRecognizer = m.strokeRecognizer
      if (m.formulaEvaluator) this.formulaEvaluator = m.formulaEvaluator
    }
  }

  has(id: string): boolean {
    return this.modules.some((m) => m.id === id)
  }

  /** Draws one item in board coordinates, in the colours of the current surface (withInkSurface). */
  draw(ctx: Ctx, item: Item): void {
    const kind = this.kinds.get(item.type)
    if (kind?.display) paint(ctx, kind.display(item), inkColors)
    else kind?.draw?.(ctx, item)
  }

  /** One item as SVG markup (for SVG and PDF exports); empty when no module draws its type. */
  svg(item: Item): string {
    const kind = this.kinds.get(item.type)
    if (kind?.display) return toSvg(kind.display(item), inkColors)
    return kind?.svg?.(item) ?? ''
  }
}
