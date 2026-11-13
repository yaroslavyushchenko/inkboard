import { drawSmudges } from './chalkTexture'
import { bgPattern, isChalk, surfaceColor } from './surface'
import type { BackgroundKind, Camera } from './types'

export { PAPER_COLOR } from './surface'

export const BACKGROUND_STYLE = {
  dots: { step: 24, color: '#c4c6cc' },
  grid: { step: 24, color: '#e6e8ee' },
  lines: { step: 32, color: '#dde2ea' }
} as const

/** Pattern colours on the green chalkboard: faint, like lines painted on a lecture board. */
export const CHALK_PATTERN_COLOR = { dots: '#6f8a7c', grid: '#46625a', lines: '#4c685c' } as const

export function patternColor(bg: BackgroundKind, pattern: keyof typeof BACKGROUND_STYLE): string {
  return isChalk(bg) ? CHALK_PATTERN_COLOR[pattern] : BACKGROUND_STYLE[pattern].color
}

/** Spacing in world units, doubled when zoomed out so the pattern never gets too dense. */
function adaptiveStep(base: number, zoom: number, minPx: number): number {
  let step = base
  while (step * zoom < minPx) step *= 2
  return step
}

/**
 * Draws the paper pattern in device pixels (identity transform).
 * The pattern is tied to world coordinates so it moves and scales with the board.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundKind,
  cam: Camera,
  width: number,
  height: number,
  dpr: number
): void {
  ctx.fillStyle = surfaceColor(bg)
  ctx.fillRect(0, 0, width * dpr, height * dpr)
  if (isChalk(bg)) drawSmudges(ctx, cam.zoom * dpr, cam.x, cam.y, width * dpr, height * dpr)
  const kind = bgPattern(bg)
  if (kind === 'blank') return

  const style = BACKGROUND_STYLE[kind]
  const step = adaptiveStep(style.step, cam.zoom, kind === 'dots' ? 12 : 10)
  const stepPx = step * cam.zoom * dpr
  // Screen position (device px) of the first pattern line at or before the left/top edge.
  const offX = -((((cam.x / step) % 1) + 1) % 1) * stepPx
  const offY = -((((cam.y / step) % 1) + 1) % 1) * stepPx
  const W = width * dpr
  const H = height * dpr

  ctx.fillStyle = patternColor(bg, kind)
  if (kind === 'dots') {
    // Barely visible dots, constant on-screen size regardless of zoom.
    const r = Math.max(1, Math.round(1.1 * dpr))
    ctx.beginPath()
    for (let y = offY; y <= H; y += stepPx) {
      for (let x = offX; x <= W; x += stepPx) {
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
    }
    ctx.fill()
    return
  }

  const lw = Math.max(1, Math.round(dpr))
  if (kind === 'grid') {
    for (let x = offX; x <= W; x += stepPx) ctx.fillRect(Math.round(x), 0, lw, H)
  }
  for (let y = offY; y <= H; y += stepPx) ctx.fillRect(0, Math.round(y), W, lw)
}
