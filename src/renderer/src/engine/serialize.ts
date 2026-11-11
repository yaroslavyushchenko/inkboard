import { graphBBox, sanitizeGraph } from './graph'
import { isShapeKind, MAX_BASE, MIN_BASE } from './shapes'
import { textBBox } from './text'
import type { TextRun } from './types'
import type { BackgroundKind, Camera, GraphItem, GraphParams, Item, LineCap, LineDash, Point, ShapeSpec, TextItem } from './types'

/**
 * `.inkboard` file format: gzip-compressed JSON.
 * Ink stays vector (flattened point lists). Images are stored once in `assets` as data URLs,
 * byte-for-byte as they were inserted, and referenced by key.
 */
export const FORMAT = 'inkboard'
/**
 * 2 = straight-line strokes (`geom`), coordinate graphs, groups.
 * 3 = line patterns (`dash`) and line ends (`startCap` / `endCap`).
 * 4 = editable shapes (`shape` spec on shape strokes), locked items (`locked`), text items.
 * 5 = formatted text (`runs` on text items), any number of sides for a solid's base.
 * Readers accept ≤ this; older apps refuse newer files instead of silently dropping data.
 */
export const FORMAT_VERSION = 5

interface SerializedStroke {
  type: 'stroke'
  id: string
  z: number
  tool: 'pen' | 'highlighter'
  color: string
  size: number
  pressure: boolean
  /** Flattened [x, y, pressure, x, y, pressure, ...]. */
  pts: number[]
  geom?: 'line'
  groupId?: string
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
  shape?: ShapeSpec
  locked?: boolean
}

interface SerializedGraph extends GraphParams {
  groupId?: string
  locked?: boolean
  type: 'graph'
  id: string
  z: number
  ox: number
  oy: number
  color: string
}

interface SerializedImage {
  groupId?: string
  locked?: boolean
  type: 'image'
  id: string
  z: number
  asset: string
  x: number
  y: number
  w: number
  h: number
}

interface SerializedText {
  type: 'text'
  id: string
  z: number
  x: number
  y: number
  text: string
  size: number
  color: string
  runs?: TextRun[]
  groupId?: string
  locked?: boolean
}

export interface BoardFile {
  format: typeof FORMAT
  version: number
  background: BackgroundKind
  camera: Camera
  assets: Record<string, string>
  items: (SerializedStroke | SerializedImage | SerializedGraph | SerializedText)[]
}

export interface BoardData {
  items: Item[]
  background: BackgroundKind
  camera: Camera
}

const r2 = (v: number): number => Math.round(v * 100) / 100
const r3 = (v: number): number => Math.round(v * 1000) / 1000

export function serializeBoard(data: BoardData): BoardFile {
  const assetKeys = new Map<string, string>()
  const assets: Record<string, string> = {}
  const items = data.items.map((it): SerializedStroke | SerializedImage | SerializedGraph | SerializedText => {
    if (it.type === 'stroke') {
      const pts: number[] = new Array(it.points.length * 3)
      it.points.forEach(([x, y, p], i) => {
        pts[i * 3] = r2(x)
        pts[i * 3 + 1] = r2(y)
        pts[i * 3 + 2] = r3(p)
      })
      const { id, z, tool, color, size, pressure, geom, groupId, dash, startCap, endCap, shape, locked } = it
      return {
        type: 'stroke', id, z, tool, color, size, pressure, pts,
        ...(geom ? { geom } : {}),
        ...(groupId ? { groupId } : {}),
        ...(dash ? { dash } : {}),
        ...(startCap ? { startCap } : {}),
        ...(endCap ? { endCap } : {}),
        ...(shape ? { shape } : {}),
        ...(locked ? { locked } : {})
      }
    }
    if (it.type === 'graph' || it.type === 'text') {
      const { bbox: _bbox, ...rest } = it
      return rest
    }
    let key = assetKeys.get(it.src)
    if (!key) {
      key = `img${assetKeys.size + 1}`
      assetKeys.set(it.src, key)
      assets[key] = it.src
    }
    return {
      type: 'image', id: it.id, z: it.z, asset: key, x: it.x, y: it.y, w: it.w, h: it.h,
      ...(it.groupId ? { groupId: it.groupId } : {}),
      ...(it.locked ? { locked: true } : {})
    }
  })
  return { format: FORMAT, version: FORMAT_VERSION, background: data.background, camera: data.camera, assets, items }
}

export function deserializeBoard(file: BoardFile): BoardData {
  if (file?.format !== FORMAT) throw new Error('Not an Inkboard file')
  if (file.version > FORMAT_VERSION) throw new Error('This board was made with a newer version of Inkboard')
  const items: Item[] = []
  for (const s of file.items) {
    if (s.type === 'stroke') {
      const points: Point[] = []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i + 2 < s.pts.length; i += 3) {
        const x = s.pts[i], y = s.pts[i + 1]
        points.push([x, y, s.pts[i + 2]])
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      if (points.length === 0) continue
      const pad = s.size
      items.push({
        type: 'stroke', id: s.id, z: s.z, tool: s.tool, color: s.color, size: s.size, pressure: s.pressure, points,
        ...(s.geom === 'line' ? { geom: 'line' as const } : {}),
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.dash ? { dash: s.dash } : {}),
        ...(s.startCap ? { startCap: s.startCap } : {}),
        ...(s.endCap ? { endCap: s.endCap } : {}),
        ...(readSpec(s.shape) ? { shape: readSpec(s.shape)! } : {}),
        ...(s.locked ? { locked: true } : {}),
        bbox: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
      })
    } else if (s.type === 'graph') {
      const g: GraphItem = { ...sanitizeGraph(s), type: 'graph', id: s.id, z: s.z, ox: s.ox, oy: s.oy, color: s.color, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
      if (s.groupId) g.groupId = s.groupId
      if (s.locked) g.locked = true
      g.bbox = graphBBox(g)
      items.push(g)
    } else if (s.type === 'text') {
      if (typeof s.text !== 'string' || !s.text || !(s.size > 0)) continue
      const t: TextItem = {
        type: 'text', id: s.id, z: s.z, x: s.x, y: s.y, text: s.text, size: s.size, color: s.color,
        ...(readRuns(s.runs, s.text) ? { runs: readRuns(s.runs, s.text)! } : {}),
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      }
      t.bbox = textBBox(t)
      items.push(t)
    } else if (s.type === 'image') {
      const src = file.assets[s.asset]
      if (!src) continue
      items.push({
        type: 'image', id: s.id, z: s.z, src, x: s.x, y: s.y, w: s.w, h: s.h,
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        bbox: { minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h }
      })
    }
  }
  return {
    items,
    background: file.background ?? 'dots',
    camera: file.camera ?? { x: 0, y: 0, zoom: 1 }
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeBoard(data: BoardData): Promise<Uint8Array> {
  const json = JSON.stringify(serializeBoard(data))
  return pipe(new TextEncoder().encode(json), new CompressionStream('gzip'))
}

export async function decodeBoard(bytes: Uint8Array): Promise<BoardData> {
  // Accept both gzip and plain JSON (handy for debugging / hand-edited files).
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const raw = isGzip ? await pipe(bytes, new DecompressionStream('gzip')) : bytes
  return deserializeBoard(JSON.parse(new TextDecoder().decode(raw)) as BoardFile)
}

/** Validate a stored shape spec (ignored if malformed, the strokes themselves still load). */
function readSpec(v: unknown): ShapeSpec | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isShapeKind(o.kind)) return null
  const nums = [o.ax, o.ay, o.bx, o.by]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const spec: ShapeSpec = { kind: o.kind, ax: o.ax as number, ay: o.ay as number, bx: o.bx as number, by: o.by as number }
  if (typeof o.base === 'number' && Number.isInteger(o.base) && o.base >= MIN_BASE && o.base <= MAX_BASE) spec.base = o.base
  return spec
}

/** Validated text runs: only known fields, and their texts must add up to the item's text. */
function readRuns(v: unknown, text: string): TextRun[] | null {
  if (!Array.isArray(v) || !v.length) return null
  const out: TextRun[] = []
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r.text !== 'string') return null
    const o: TextRun = { text: r.text }
    if (typeof r.color === 'string') o.color = r.color
    if (typeof r.size === 'number' && r.size > 0 && Number.isFinite(r.size)) o.size = r.size
    if (r.bold === true) o.bold = true
    if (r.italic === true) o.italic = true
    if (r.underline === true) o.underline = true
    out.push(o)
  }
  return out.map((r) => r.text).join('') === text ? out : null
}
