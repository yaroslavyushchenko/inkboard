import { BACKGROUND_STYLE, drawBackground, PAPER_COLOR } from './background'
import { loadImage } from './images'
import { formulaSvg } from './formulatype'
import { graphSvg } from './graph'
import { capsSvg, dashPattern, HIGHLIGHTER_ALPHA, inkOutlineSvg, lineSvgPath, usesLineRender } from './ink'
import { drawItems } from './renderer'
import { textSvg } from './text'
import { unionBBox } from './transform'
import type { BackgroundKind, BBox, Camera, Item } from './types'

/** Make sure every image is decoded before drawing off-screen (otherwise it would be skipped). */
async function ensureImages(items: readonly Item[]): Promise<void> {
  await Promise.all(items.filter((i) => i.type === 'image').map((i) => loadImage(i.src).catch(() => null)))
}

function contentBox(items: readonly Item[], pad: number): BBox {
  const b = unionBBox([...items]) ?? { minX: 0, minY: 0, maxX: 640, maxY: 400 }
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }
}

async function renderToBlob(
  items: readonly Item[],
  bg: BackgroundKind,
  box: BBox,
  W: number,
  H: number,
  scale: number,
  type: string,
  quality?: number
): Promise<Uint8Array> {
  await ensureImages(items)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')!
  // Centre the content box in the output.
  const cam: Camera = {
    zoom: scale,
    x: (box.minX + box.maxX) / 2 - W / scale / 2,
    y: (box.minY + box.maxY) / 2 - H / scale / 2
  }
  drawBackground(ctx as unknown as CanvasRenderingContext2D, bg, cam, W, H, 1)
  ctx.setTransform(scale, 0, 0, scale, -cam.x * scale, -cam.y * scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  drawItems(ctx, items, { minX: cam.x, minY: cam.y, maxX: cam.x + W / scale, maxY: cam.y + H / scale })
  const blob = await canvas.convertToBlob({ type, quality })
  return new Uint8Array(await blob.arrayBuffer())
}

export const THUMB_W = 480
export const THUMB_H = 320

/** Card preview: the whole board fitted into 480×320. */
export function renderThumbnail(items: readonly Item[], bg: BackgroundKind): Promise<Uint8Array> {
  const box = contentBox(items, 0)
  const bw = box.maxX - box.minX
  const bh = box.maxY - box.minY
  const pad = 0.08
  const scale = Math.min(1.5, (THUMB_W * (1 - 2 * pad)) / bw, (THUMB_H * (1 - 2 * pad)) / bh)
  return renderToBlob(items, bg, box, THUMB_W, THUMB_H, scale, 'image/webp', 0.85)
}

/** PNG at 2 px per board unit (capped so the longest side stays ≤ 8000 px). */
export async function renderPng(items: readonly Item[], bg: BackgroundKind): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const box = contentBox(items, 24)
  const bw = box.maxX - box.minX
  const bh = box.maxY - box.minY
  const scale = Math.min(2, 8000 / Math.max(bw, bh))
  const width = Math.ceil(bw * scale)
  const height = Math.ceil(bh * scale)
  return { bytes: await renderToBlob(items, bg, box, width, height, scale, 'image/png'), width, height }
}

const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function patternDefs(bg: BackgroundKind): string {
  if (bg === 'blank') return ''
  const st = BACKGROUND_STYLE[bg]
  const s = st.step
  let tile = ''
  if (bg === 'dots') {
    tile = `<pattern id="paper" width="${s}" height="${s}" x="${-s / 2}" y="${-s / 2}" patternUnits="userSpaceOnUse"><circle cx="${s / 2}" cy="${s / 2}" r="1.1" fill="${st.color}"/></pattern>`
  } else if (bg === 'grid') {
    tile = `<pattern id="paper" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><rect width="${s}" height="1" fill="${st.color}"/><rect width="1" height="${s}" fill="${st.color}"/></pattern>`
  } else {
    tile = `<pattern id="paper" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><rect width="${s}" height="1" fill="${st.color}"/></pattern>`
  }
  return `<defs>${tile}</defs>`
}

/**
 * Vector SVG of the board (ink outlines as paths, images embedded at original resolution).
 * width/height are the output size in px; very large boards are scaled down to stay printable.
 */
export function renderSvg(items: readonly Item[], bg: BackgroundKind): { svg: string; width: number; height: number } {
  const box = contentBox(items, 24)
  const bw = box.maxX - box.minX
  const bh = box.maxY - box.minY
  const fit = Math.min(1, 14000 / Math.max(bw, bh))
  const width = Math.ceil(bw * fit)
  const height = Math.ceil(bh * fit)
  const parts: string[] = []
  const vb = `${r2(box.minX)} ${r2(box.minY)} ${r2(bw)} ${r2(bh)}`
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb}">`)
  parts.push(patternDefs(bg))
  parts.push(`<rect x="${r2(box.minX)}" y="${r2(box.minY)}" width="${r2(bw)}" height="${r2(bh)}" fill="${PAPER_COLOR}"/>`)
  if (bg !== 'blank') parts.push(`<rect x="${r2(box.minX)}" y="${r2(box.minY)}" width="${r2(bw)}" height="${r2(bh)}" fill="url(#paper)"/>`)
  for (const it of items) {
    if (it.type === 'graph') {
      parts.push(graphSvg(it))
    } else if (it.type === 'text') {
      parts.push(textSvg(it))
    } else if (it.type === 'formula') {
      parts.push(formulaSvg(it))
    } else if (it.type === 'image') {
      parts.push(`<image href="${esc(it.src)}" x="${r2(it.x)}" y="${r2(it.y)}" width="${r2(it.w)}" height="${r2(it.h)}" preserveAspectRatio="none"/>`)
    } else if (usesLineRender(it)) {
      const hl = it.tool === 'highlighter' ? ` stroke-opacity="${HIGHLIGHTER_ALPHA}" style="mix-blend-mode:multiply"` : ''
      const dash = it.dash ? ` stroke-dasharray="${dashPattern(it.dash, it.size).map(r2).join(' ')}"` : ''
      parts.push(
        `<path d="${lineSvgPath(it.points)}" fill="none" stroke="${esc(it.color)}" stroke-width="${r2(it.size)}" stroke-linecap="round" stroke-linejoin="round"${dash}${hl}/>`
      )
      parts.push(capsSvg(it))
    } else {
      const d = inkOutlineSvg(it)
      if (!d) continue
      const hl = it.tool === 'highlighter' ? ` fill-opacity="${HIGHLIGHTER_ALPHA}" style="mix-blend-mode:multiply"` : ''
      parts.push(`<path d="${d}" fill="${esc(it.color)}"${hl}/>`)
    }
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width, height }
}
