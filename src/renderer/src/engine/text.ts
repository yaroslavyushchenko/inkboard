import type { BBox, TextItem } from './types'

/** Text on the board: plain lines (Enter = new line), one font, sized in board units so it zooms. */
export const TEXT_FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
export const TEXT_LINE_HEIGHT = 1.25
export const TEXT_SIZES = [16, 24, 36, 56]

let measureCtx: OffscreenCanvasRenderingContext2D | null = null

/** Width / height of a text block in board units. */
export function measureText(text: string, size: number): { w: number; h: number } {
  measureCtx ??= new OffscreenCanvas(1, 1).getContext('2d')!
  // Measure at a fixed size and scale, so the box doesn't depend on rounding at small sizes.
  measureCtx.font = `100px ${TEXT_FONT}`
  const lines = text.split('\n')
  const w = Math.max(...lines.map((l) => measureCtx!.measureText(l).width)) * (size / 100)
  return { w: Math.max(w, size * 0.3), h: lines.length * size * TEXT_LINE_HEIGHT }
}

export function textBBox(t: Pick<TextItem, 'x' | 'y' | 'text' | 'size'>): BBox {
  const { w, h } = measureText(t.text, t.size)
  return { minX: t.x, minY: t.y, maxX: t.x + w, maxY: t.y + h }
}

export function drawText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextItem): void {
  ctx.save()
  ctx.font = `${t.size}px ${TEXT_FONT}`
  ctx.fillStyle = t.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const lh = t.size * TEXT_LINE_HEIGHT
  t.text.split('\n').forEach((line, i) => ctx.fillText(line, t.x, t.y + lh * i + lh / 2))
  ctx.restore()
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()

export function textSvg(t: TextItem): string {
  const lh = t.size * TEXT_LINE_HEIGHT
  const spans = t.text
    .split('\n')
    .map((line, i) => `<tspan x="${r2(t.x)}" y="${r2(t.y + lh * i + lh / 2)}">${esc(line) || ' '}</tspan>`)
    .join('')
  return `<text font-family="${esc(TEXT_FONT)}" font-size="${r2(t.size)}" fill="${esc(t.color)}" dominant-baseline="middle" xml:space="preserve">${spans}</text>`
}
