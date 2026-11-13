import { bboxOfPoints, newId } from './geometry'
import { sameSpec, specParts } from './shapes'
import type { Item, LineCap, LineDash, ShapeSpec, StrokeItem } from './types'

export interface ShapeStyle {
  color: string
  size: number
  tool: 'pen' | 'highlighter'
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
}

/**
 * Stroke items for a shape spec. `slots` hands out the id and z of each part (re-generation reuses the
 * old ones so the shape keeps its place in the stacking order). Solids get one group so they move as one.
 */
export function buildShapeItems(
  spec: ShapeSpec,
  style: ShapeStyle,
  slot: (i: number) => { id: string; z: number },
  groupId?: string,
  locked?: boolean
): StrokeItem[] {
  const parts = specParts(spec, style.size)
  const gid = groupId ?? (parts.length > 1 ? newId() : undefined)
  // Line ends only decorate the Line shape.
  const caps = spec.kind === 'line' ? { startCap: style.startCap, endCap: style.endCap } : {}
  return parts.map((part, i): StrokeItem => {
    const dash = part.dash ?? style.dash
    const { id, z } = slot(i)
    return {
      type: 'stroke',
      id,
      z,
      tool: style.tool,
      color: style.color,
      size: style.size,
      pressure: false,
      geom: 'line',
      points: part.points,
      bbox: bboxOfPoints(part.points, style.size * 3),
      shape: spec,
      ...(dash ? { dash } : {}),
      ...(caps.startCap ? { startCap: caps.startCap } : {}),
      ...(caps.endCap ? { endCap: caps.endCap } : {}),
      ...(gid ? { groupId: gid } : {}),
      ...(locked ? { locked } : {})
    }
  })
}

/** All items that belong to the same generated shape as `item` (every part of a solid). */
export function shapeMembers(items: readonly Item[], item: Item): Item[] {
  // Parts of a solid always share a group; a flat shape is a single stroke.
  if (item.type !== 'stroke' || !item.shape || !item.groupId) return [item]
  return items.filter((i) => i.type === 'stroke' && i.groupId === item.groupId && sameSpec(i.shape, item.shape))
}

/**
 * The selection is exactly one complete generated shape → its spec and parts, so it can be edited.
 * (A shape with a part erased, or mixed with other items, isn't editable.)
 */
export function editableShape(items: readonly Item[]): { spec: ShapeSpec; parts: StrokeItem[] } | null {
  const first = items[0]
  if (!first || first.type !== 'stroke' || !first.shape) return null
  const spec = first.shape
  if (!items.every((i) => i.type === 'stroke' && i.groupId === first.groupId && sameSpec(i.shape, spec))) return null
  if (items.length !== specParts(spec, first.size).length) return null
  return { spec, parts: items as StrokeItem[] }
}

/** Style of a generated shape, read from its first part (always a visible edge). */
export function shapeStyleOf(parts: readonly StrokeItem[]): ShapeStyle {
  const sorted = [...parts].sort((a, b) => a.z - b.z)
  const f = sorted[0]
  const end = parts.find((p) => p.startCap || p.endCap)
  return {
    color: f.color,
    size: f.size,
    tool: f.tool,
    ...(f.dash ? { dash: f.dash } : {}),
    ...(end?.startCap ? { startCap: end.startCap } : {}),
    ...(end?.endCap ? { endCap: end.endCap } : {})
  }
}

/**
 * Re-generate a shape with a new spec, keeping its style, group, lock and stacking position.
 * `inUserGroup`: the shape is grouped with other items, so its group must survive.
 */
export function regenerateShape(parts: readonly StrokeItem[], spec: ShapeSpec, allocZ: () => number, inUserGroup: boolean): StrokeItem[] {
  const sorted = [...parts].sort((a, b) => a.z - b.z)
  const style = shapeStyleOf(sorted)
  const n = specParts(spec, style.size).length
  const old = sorted[0].groupId
  const groupId = old && (inUserGroup || n > 1) ? old : n > 1 ? newId() : undefined
  return buildShapeItems(
    spec,
    style,
    (i) => (i < sorted.length ? { id: sorted[i].id, z: sorted[i].z } : { id: newId(), z: allocZ() }),
    groupId,
    sorted[0].locked
  )
}
