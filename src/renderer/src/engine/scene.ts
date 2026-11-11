import type { Item } from './types'

interface HistoryEntry {
  added: Item[]
  removed: Item[]
}

/**
 * Holds every item on the board in z-order plus the undo/redo history.
 * Plain class (not React state) so the render loop can read it without re-renders.
 */
export class Scene {
  private items: Item[] = []
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private listeners = new Set<() => void>()
  private nextZ = 1
  /** Bumped on every change; used for dirty tracking. */
  version = 0

  getItems(): readonly Item[] {
    return this.items
  }

  allocZ(): number {
    return this.nextZ++
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  add(items: Item[], record = true): void {
    if (items.length === 0) return
    this.insert(items)
    if (record) this.record({ added: items, removed: [] })
    this.emit()
  }

  remove(items: Item[], record = true): void {
    if (items.length === 0) return
    this.delete(items)
    if (record) this.record({ added: [], removed: items })
    this.emit()
  }

  /** Swap items for updated versions with the same ids (move / scale). */
  replace(oldItems: Item[], newItems: Item[]): void {
    if (oldItems.length === 0) return
    this.delete(oldItems)
    this.insert(newItems)
    this.record({ added: newItems, removed: oldItems })
  }

  /** Replace the whole board (open file / new board). Clears history. */
  load(items: Item[]): void {
    this.items = [...items].sort((a, b) => a.z - b.z)
    this.nextZ = this.items.reduce((m, i) => Math.max(m, i.z), 0) + 1
    this.undoStack = []
    this.redoStack = []
    this.emit()
  }

  getById(ids: Iterable<string>): Item[] {
    const set = new Set(ids)
    return this.items.filter((i) => set.has(i.id))
  }

  /** Push an already-applied change (e.g. an eraser drag that removed items live). */
  record(entry: HistoryEntry): void {
    if (entry.added.length === 0 && entry.removed.length === 0) return
    this.undoStack.push(entry)
    this.redoStack = []
    this.emit()
  }

  undo(): void {
    const entry = this.undoStack.pop()
    if (!entry) return
    this.delete(entry.added)
    this.insert(entry.removed)
    this.redoStack.push(entry)
    this.emit()
  }

  redo(): void {
    const entry = this.redoStack.pop()
    if (!entry) return
    this.delete(entry.removed)
    this.insert(entry.added)
    this.undoStack.push(entry)
    this.emit()
  }

  clear(): void {
    this.remove([...this.items])
  }

  private insert(items: Item[]): void {
    this.items = this.items.concat(items).sort((a, b) => a.z - b.z)
    for (const i of items) if (i.z >= this.nextZ) this.nextZ = i.z + 1
  }

  private delete(items: Item[]): void {
    const ids = new Set(items.map((i) => i.id))
    this.items = this.items.filter((i) => !ids.has(i.id))
  }

  private emit(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }
}
