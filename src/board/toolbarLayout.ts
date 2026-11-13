export const DEFAULT_TOOLBAR = [
  'select', 'brushSelect', 'move', 'pan',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', 'laser',
  'text', 'formula', 'shapes', 'graph', 'templates', 'image',
  'ruler', 'square45', 'square60', 'protractor', 'compass',
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

export function cleanToolbarLayout(value: unknown): ToolbarItemId[] | null {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter((id): id is ToolbarItemId => typeof id === 'string' && (DEFAULT_TOOLBAR.some((tool) => tool === id) || /^divider:[a-zA-Z0-9-]+$/.test(id))))]
}
