import { drawSmudges } from './chalkTexture'
import { bgPattern, isChalk, surfaceColor } from './surface'
import type { BackgroundKind, Camera } from './types'

export { PAPER_COLOR } from './surface'

export const BACKGROUND_STYLE = {
  dots: { step: 24, color: '#c4c6cc' },
  grid: { step: 24, color: '#e6e8ee' },
  lines: { step: 32, color: '#dde2ea' },
  /** Cells as on grid paper; every 5th line is darker. */
  math: { step: 24, color: '#e6e8ee' },
  /** Handwriting rows: letters 24 high between the top and base line, 24 free between rows. */
  hand: { step: 72, color: '#d3d9e3' },
  /** Copybook rows 24 high, 24 apart, with slanted guide lines every 24. */
  slant: { step: 48, color: '#e1e5ec' }
} as const

/** Pattern colours on the green chalkboard: faint, like lines painted on a lecture board. */
export const CHALK_PATTERN_COLOR = {
  dots: '#6f8a7c', grid: '#46625a', lines: '#4c685c', math: '#46625a', hand: '#4f6d63', slant: '#42605a'
} as const

/** The darker every-5th line of the math grid, and the main lines of school rows. */
export const MAJOR_COLOR = { paper: '#a9b2c2', chalk: '#7c9a8e' } as const
/** Writing rows: letter height, gap between rows, and the slant of copybook guide lines (from horizontal). */
export const ROW = { letter: 24, gap: 24, slantDeg: 65, slantStep: 24 } as const

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

  if (kind === 'math' || kind === 'hand' || kind === 'slant') return drawSchoolPaper(ctx, bg, kind, cam, width * dpr, height * dpr, dpr)

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

/**
 * School papers, drawn in device pixels with world-tied lines. When zoomed far out the fine lines
 * disappear first so the pattern never turns into a grey wash.
 */
function drawSchoolPaper(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundKind,
  kind: 'math' | 'hand' | 'slant',
  cam: Camera,
  W: number,
  H: number,
  dpr: number
): void {
  const z = cam.zoom * dpr
  const X = (wx: number): number => (wx - cam.x) * z
  const Y = (wy: number): number => (wy - cam.y) * z
  const x0 = cam.x
  const y0 = cam.y
  const x1 = cam.x + W / z
  const y1 = cam.y + H / z
  const lw = Math.max(1, Math.round(dpr))
  const minor = patternColor(bg, kind)
  const major = isChalk(bg) ? MAJOR_COLOR.chalk : MAJOR_COLOR.paper
  const hline = (wy: number, color: string, dash = 0): void => {
    ctx.fillStyle = color
    const y = Math.round(Y(wy))
    if (!dash) return ctx.fillRect(0, y, W, lw)
    const d = dash * z
    const start = X(Math.floor(x0 / (dash * 2)) * dash * 2)
    for (let x = start; x < W; x += d * 2) ctx.fillRect(Math.round(x), y, Math.max(lw, Math.round(d)), lw)
  }

  if (kind === 'math') {
    const step = BACKGROUND_STYLE.math.step
    const fine = step * cam.zoom >= 7
    // Far out even the 5-cell lines crowd together: then the pattern stops.
    if (step * 5 * cam.zoom < 10) return
    for (let i = Math.floor(x0 / step); i * step <= x1; i++) {
      if (i % 5 !== 0 && !fine) continue
      ctx.fillStyle = i % 5 === 0 ? major : minor
      ctx.fillRect(Math.round(X(i * step)), 0, lw, H)
    }
    for (let i = Math.floor(y0 / step); i * step <= y1; i++) {
      if (i % 5 !== 0 && !fine) continue
      ctx.fillStyle = i % 5 === 0 ? major : minor
      ctx.fillRect(0, Math.round(Y(i * step)), W, lw)
    }
    return
  }

  const period = BACKGROUND_STYLE[kind].step
  if (period * cam.zoom < 10) return
  const detail = ROW.letter * cam.zoom >= 9
  for (let r = Math.floor(y0 / period); r * period <= y1; r++) {
    const top = r * period
    if (kind === 'hand') {
      // Top line, dashed middle (where small letters end), base line.
      hline(top, major)
      if (detail) hline(top + ROW.letter, minor, 4)
      hline(top + ROW.letter * 2, major)
    } else {
      hline(top, major)
      hline(top + ROW.letter, major)
    }
  }
  if (kind === 'slant' && detail) {
    // Slanted guide lines across each row band (65° from the line, leaning right).
    const run = 1 / Math.tan((ROW.slantDeg * Math.PI) / 180)
    ctx.strokeStyle = minor
    ctx.lineWidth = lw
    ctx.beginPath()
    // Lines that cross the view: x0 ≤ bx − y · run ≤ x1 somewhere between y0 and y1.
    for (let k = Math.floor((x0 + y0 * run) / ROW.slantStep); k * ROW.slantStep <= x1 + y1 * run; k++) {
      const bx = k * ROW.slantStep
      // The line through (bx, 0): x = bx − y · run, so it leans right going up.
      ctx.moveTo(X(bx - y0 * run), Y(y0))
      ctx.lineTo(X(bx - y1 * run), Y(y1))
    }
    ctx.stroke()
  }
}
