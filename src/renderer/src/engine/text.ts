import type { BBox, TextFormat, TextItem, TextRun } from './types'

/**
 * Text on the board: lines (Enter = new line) of differently formatted runs (colour, size, bold,
 * italic, underline), sized in board units so it zooms. The layout here matches how the in-place
 * editor (a contenteditable with the same font and line-height) lays the same text out.
 */
export const TEXT_FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
export const TEXT_LINE_HEIGHT = 1.25
export const TEXT_SIZES = [16, 24, 36, 56]

/** A run with every format field filled in. */
export interface FullRun {
  text: string
  color: string
  size: number
  bold: boolean
  italic: boolean
  underline: boolean
}

type TextLike = Pick<TextItem, 'text' | 'size' | 'color' | 'runs'>

/** The text's runs with the item's colour / size filled in where a run doesn't set its own. */
export function fullRuns(t: TextLike): FullRun[] {
  const runs: TextRun[] = t.runs?.length ? t.runs : [{ text: t.text }]
  return runs.map((r) => ({
    text: r.text,
    color: r.color ?? t.color,
    size: r.size ?? t.size,
    bold: !!r.bold,
    italic: !!r.italic,
    underline: !!r.underline
  }))
}

export const sameFormat = (a: FullRun, b: FullRun): boolean =>
  a.color === b.color && a.size === b.size && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline

/** Joins neighbouring runs with the same formatting and drops empty ones. */
export function mergeRuns(runs: FullRun[]): FullRun[] {
  const out: FullRun[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = out[out.length - 1]
    if (last && sameFormat(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text }
    else out.push({ ...r })
  }
  return out
}

/**
 * Item fields for formatted text: the base colour / size are the most common colour and the smallest
 * size (the editor's line floor); `runs` only when some piece differs from that.
 */
export function textFields(full: FullRun[], fallback: { color: string; size: number }): Pick<TextItem, 'text' | 'color' | 'size' | 'runs'> {
  const runs = mergeRuns(full)
  const text = runs.map((r) => r.text).join('')
  if (!runs.length) return { text, color: fallback.color, size: fallback.size }
  const count = new Map<string, number>()
  for (const r of runs) count.set(r.color, (count.get(r.color) ?? 0) + r.text.length)
  const color = [...count].sort((a, b) => b[1] - a[1])[0][0]
  const size = Math.min(...runs.map((r) => r.size))
  if (runs.length === 1 && runs[0].color === color && !runs[0].bold && !runs[0].italic && !runs[0].underline) return { text, color, size }
  return {
    text,
    color,
    size,
    runs: runs.map((r) => {
      const o: TextRun = { text: r.text }
      if (r.color !== color) o.color = r.color
      if (r.size !== size) o.size = r.size
      if (r.bold) o.bold = true
      if (r.italic) o.italic = true
      if (r.underline) o.underline = true
      return o
    })
  }
}

/** Applies a format change to every run of the text (whole-item restyle from the selection bar). */
export function formatAll(t: TextLike, patch: TextFormat): Pick<TextItem, 'text' | 'color' | 'size' | 'runs'> {
  const runs = fullRuns(t)
  let scale = 1
  // A new size keeps the relative sizes: the smallest run gets the new size, others scale with it.
  if (patch.size) scale = patch.size / Math.min(...runs.map((r) => r.size))
  return textFields(
    runs.map((r) => ({
      ...r,
      size: r.size * scale,
      ...(patch.color ? { color: patch.color } : {}),
      ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
      ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
      ...(patch.underline !== undefined ? { underline: patch.underline } : {})
    })),
    t
  )
}

/** Scales all font sizes of a text (resize handles). */
export function scaleRuns(runs: TextRun[] | undefined, s: number): TextRun[] | undefined {
  return runs?.map((r) => (r.size ? { ...r, size: r.size * s } : r))
}

export const runFont = (r: Pick<FullRun, 'bold' | 'italic'>, size: number): string =>
  `${r.italic ? 'italic ' : ''}${r.bold ? 'bold ' : ''}${size}px ${TEXT_FONT}`

let measureCtx: OffscreenCanvasRenderingContext2D | null = null
let metrics: { above: number; below: number } | null = null

function mctx(): OffscreenCanvasRenderingContext2D {
  measureCtx ??= new OffscreenCanvas(1, 1).getContext('2d')!
  return measureCtx
}

/**
 * Where the baseline sits in a line, as in CSS: each font size s puts s·(LH/2 + (A−D)/2) above the
 * baseline and s·(LH/2 − (A−D)/2) below (A / D = the font's ascent / descent per unit size).
 */
function lineMetrics(): { above: number; below: number } {
  if (metrics) return metrics
  const c = mctx()
  c.font = `100px ${TEXT_FONT}`
  const m = c.measureText('Hg')
  const a = (m.fontBoundingBoxAscent || 80) / 100
  const d = (m.fontBoundingBoxDescent || 20) / 100
  metrics = { above: TEXT_LINE_HEIGHT / 2 + (a - d) / 2, below: TEXT_LINE_HEIGHT / 2 - (a - d) / 2 }
  return metrics
}

function width(text: string, r: FullRun): number {
  const c = mctx()
  // Measure at a fixed size and scale, so the box doesn't depend on rounding at small sizes.
  c.font = runFont(r, 100)
  return c.measureText(text).width * (r.size / 100)
}

export interface TextPiece {
  text: string
  run: FullRun
  x: number
  w: number
}
export interface TextLine {
  top: number
  baseline: number
  h: number
  w: number
  pieces: TextPiece[]
}
export interface TextLayout {
  w: number
  h: number
  lines: TextLine[]
}

const layouts = new WeakMap<object, TextLayout>()

/** Line-by-line layout relative to the text's top-left corner (cached per item object). */
export function layoutText(t: TextLike): TextLayout {
  const hit = layouts.get(t)
  if (hit) return hit
  const { above, below } = lineMetrics()
  const raw: { pieces: TextPiece[]; sizes: number[] }[] = [{ pieces: [], sizes: [] }]
  for (const run of fullRuns(t)) {
    const segs = run.text.split('\n')
    segs.forEach((seg, i) => {
      if (i > 0) {
        // The line break belongs to the line it ends, so its size counts there.
        raw[raw.length - 1].sizes.push(run.size)
        raw.push({ pieces: [], sizes: [] })
      }
      if (!seg) return
      const line = raw[raw.length - 1]
      line.pieces.push({ text: seg, run, x: 0, w: width(seg, run) })
      line.sizes.push(run.size)
    })
  }
  let y = 0
  let maxW = 0
  const lines: TextLine[] = raw.map((l) => {
    // The editor's own font size (the item's size) is the floor of every line, as in CSS.
    const s = Math.max(t.size, ...l.sizes)
    let x = 0
    for (const p of l.pieces) {
      p.x = x
      x += p.w
    }
    maxW = Math.max(maxW, x)
    const line: TextLine = { top: y, baseline: y + s * above, h: s * (above + below), w: x, pieces: l.pieces }
    y += line.h
    return line
  })
  const out = { w: Math.max(maxW, t.size * 0.3), h: y, lines }
  layouts.set(t, out)
  return out
}

/** Width / height of a plain text block in board units. */
export function measureText(text: string, size: number): { w: number; h: number } {
  const l = layoutText({ text, size, color: '#000' })
  return { w: l.w, h: l.h }
}

export function textBBox(t: Pick<TextItem, 'x' | 'y'> & TextLike): BBox {
  const { w, h } = layoutText(t)
  return { minX: t.x, minY: t.y, maxX: t.x + w, maxY: t.y + h }
}

export function drawText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextItem): void {
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  for (const line of layoutText(t).lines) {
    for (const p of line.pieces) {
      ctx.font = runFont(p.run, p.run.size)
      ctx.fillStyle = p.run.color
      const x = t.x + p.x
      const y = t.y + line.baseline
      ctx.fillText(p.text, x, y)
      if (p.run.underline) ctx.fillRect(x, y + p.run.size * 0.12, p.w, Math.max(p.run.size * 0.06, 0.5))
    }
  }
  ctx.restore()
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()

export function textSvg(t: TextItem): string {
  const lines = layoutText(t)
    .lines.map((line) => {
      const pieces = line.pieces
        .map((p) => {
          const r = p.run
          const attrs = [
            `x="${r2(t.x + p.x)}"`,
            `font-size="${r2(r.size)}"`,
            `fill="${esc(r.color)}"`,
            r.bold ? 'font-weight="bold"' : '',
            r.italic ? 'font-style="italic"' : '',
            r.underline ? 'text-decoration="underline"' : ''
          ]
          return `<tspan ${attrs.filter(Boolean).join(' ')}>${esc(p.text)}</tspan>`
        })
        .join('')
      return pieces ? `<tspan y="${r2(t.y + line.baseline)}">${pieces}</tspan>` : ''
    })
    .join('')
  return `<text font-family="${esc(TEXT_FONT)}" xml:space="preserve">${lines}</text>`
}

/** Applies a format change to the characters [start, end) of a run list (the in-place editor). */
export function formatRange(runs: FullRun[], start: number, end: number, patch: TextFormat): FullRun[] {
  const out: FullRun[] = []
  let pos = 0
  for (const r of runs) {
    const a = pos
    const b = pos + r.text.length
    pos = b
    const s = Math.max(a, start)
    const e = Math.min(b, end)
    if (s >= e) {
      out.push(r)
      continue
    }
    if (s > a) out.push({ ...r, text: r.text.slice(0, s - a) })
    out.push({ ...r, ...(patch as Partial<FullRun>), text: r.text.slice(s - a, e - a) })
    if (e < b) out.push({ ...r, text: r.text.slice(e - a) })
  }
  return mergeRuns(out)
}

/** The formatting shared by all characters in [start, end); an empty range looks at the character before it. */
export function commonFormat(runs: FullRun[], start: number, end: number): Partial<FullRun> {
  if (start === end) {
    start = Math.max(0, start - 1)
    end = start + 1
  }
  let common: Partial<FullRun> | null = null
  let pos = 0
  for (const r of runs) {
    const a = pos
    pos += r.text.length
    if (Math.min(pos, end) <= Math.max(a, start)) continue
    if (!common) common = { color: r.color, size: r.size, bold: r.bold, italic: r.italic, underline: r.underline }
    else for (const k of ['color', 'size', 'bold', 'italic', 'underline'] as const) if (common[k] !== r[k]) delete common[k]
  }
  return common ?? {}
}

/** Cuts trailing whitespace off a run list. */
export function trimRunsEnd(runs: FullRun[]): FullRun[] {
  const out = runs.map((r) => ({ ...r }))
  while (out.length) {
    const last = out[out.length - 1]
    last.text = last.text.replace(/\s+$/, '')
    if (last.text) break
    out.pop()
  }
  return out
}
