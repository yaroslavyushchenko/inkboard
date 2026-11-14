export const DEFAULT_TOOLBAR = [
  'select', 'brushSelect', 'move', 'pan',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', 'laser',
  'text', 'formula', 'shapes', 'graph', 'templates', 'image',
  'instruments',
  'undo', 'redo'
] as const

export type ToolbarToolId = (typeof DEFAULT_TOOLBAR)[number] | 'divider'
export type ToolbarItemId = ToolbarToolId | `divider:${string}`

export function isToolbarDivider(id: string): boolean {
  return id === 'divider' || /^divider:[a-zA-Z0-9-]+$/.test(id)
}

export function toolbarToolId(id: ToolbarItemId): ToolbarToolId {
  return isToolbarDivider(id) ? 'divider' : id as ToolbarToolId
}

/** Instruments had a button each up to 0.10.0; they now share one dropdown. */
const OLD_INSTRUMENT_BUTTONS = ['ruler', 'square45', 'square60', 'protractor', 'compass']

export function cleanToolbarLayout(value: unknown): ToolbarItemId[] | null {
  if (!Array.isArray(value)) return null
  // A saved layout with the old instrument buttons gets the dropdown where the first of them was.
  const ids = value.map((id) => (typeof id === 'string' && OLD_INSTRUMENT_BUTTONS.includes(id) ? 'instruments' : id))
  return [...new Set(ids.filter((id): id is ToolbarItemId => typeof id === 'string' && (DEFAULT_TOOLBAR.some((tool) => tool === id) || /^divider:[a-zA-Z0-9-]+$/.test(id))))]
}
