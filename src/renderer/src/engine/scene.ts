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
  }

  private delete(items: Item[]): void {
    const ids = new Set(items.map((i) => i.id))
    this.items = this.items.filter((i) => !ids.has(i.id))
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
