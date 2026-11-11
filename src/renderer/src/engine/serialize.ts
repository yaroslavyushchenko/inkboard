import type { BackgroundKind, Camera, Item, Point } from './types'

/**
 * `.inkboard` file format: gzip-compressed JSON.
 * Ink stays vector (flattened point lists). Images are stored once in `assets` as data URLs,
 * byte-for-byte as they were inserted, and referenced by key.
 */
export const FORMAT = 'inkboard'
export const FORMAT_VERSION = 1

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
}

interface SerializedImage {
  type: 'image'
  id: string
  z: number
  asset: string
  x: number
  y: number
  w: number
  h: number
}

export interface BoardFile {
  format: typeof FORMAT
  version: number
  background: BackgroundKind
  camera: Camera
  assets: Record<string, string>
  items: (SerializedStroke | SerializedImage)[]
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
  const items = data.items.map((it): SerializedStroke | SerializedImage => {
    if (it.type === 'stroke') {
      const pts: number[] = new Array(it.points.length * 3)
      it.points.forEach(([x, y, p], i) => {
        pts[i * 3] = r2(x)
        pts[i * 3 + 1] = r2(y)
        pts[i * 3 + 2] = r3(p)
      })
      const { id, z, tool, color, size, pressure } = it
      return { type: 'stroke', id, z, tool, color, size, pressure, pts }
    }
    let key = assetKeys.get(it.src)
    if (!key) {
      key = `img${assetKeys.size + 1}`
      assetKeys.set(it.src, key)
      assets[key] = it.src
    }
    return { type: 'image', id: it.id, z: it.z, asset: key, x: it.x, y: it.y, w: it.w, h: it.h }
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
        bbox: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
      })
    } else if (s.type === 'image') {
      const src = file.assets[s.asset]
      if (!src) continue
      items.push({
        type: 'image', id: s.id, z: s.z, src, x: s.x, y: s.y, w: s.w, h: s.h,
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
