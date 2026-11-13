/**
 * Fine chalkboard grain, painted once into a seamless tile when a chalkboard is first shown.
 * The tile follows board coordinates, like the grid.
 */

/** Tile size in board units (= px at 100% zoom). */
export const SMUDGE_TILE = 640

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

let tile: AnyCanvas | null = null
let dataUrl: string | null = null
const patterns = new WeakMap<object, CanvasPattern>()

/** Small seeded PRNG: the same board looks the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(size: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = c.height = size
    return c
  }
  return new OffscreenCanvas(size, size)
}

function paintTile(ctx: Ctx2D): void {
  const rand = rng(0x1c4a1b)
  const grain = ctx.createImageData(SMUDGE_TILE, SMUDGE_TILE)
  for (let i = 0; i < grain.data.length; i += 4) {
    grain.data[i] = 240
    grain.data[i + 1] = 244
    grain.data[i + 2] = 236
    grain.data[i + 3] = Math.floor(rand() * 7)
  }
  ctx.putImageData(grain, 0, 0)
}

function getTile(): AnyCanvas {
  if (!tile) {
    tile = makeCanvas(SMUDGE_TILE)
    const ctx = tile.getContext('2d') as Ctx2D | null
    if (ctx) paintTile(ctx)
  }
  return tile
}

/**
 * Fill the whole (identity-transformed) canvas with the chalkboard grain.
 * `k` = device px per board unit, (ox, oy) = board point at the canvas origin.
 */
export function drawSmudges(ctx: Ctx2D, k: number, ox: number, oy: number, w: number, h: number): void {
  let p = patterns.get(ctx)
  if (!p) {
    p = ctx.createPattern(getTile() as CanvasImageSource, 'repeat') ?? undefined
    if (!p) return
    patterns.set(ctx, p)
  }
  p.setTransform(new DOMMatrix([k, 0, 0, k, -ox * k, -oy * k]))
  ctx.fillStyle = p
  ctx.fillRect(0, 0, w, h)
}

/** The tile as a PNG data URL for SVG / PDF export (null where it can't be made synchronously). */
export function smudgeDataUrl(): string | null {
  if (dataUrl) return dataUrl
  const t = getTile()
  if (!('toDataURL' in t)) return null
  dataUrl = t.toDataURL('image/png')
  return dataUrl
}
