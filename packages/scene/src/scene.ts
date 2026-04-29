import type { ExcalidrawElement } from "./types"

export class Scene {
  private elements: readonly ExcalidrawElement[]
  private listeners = new Set<() => void>()

  constructor(initial: readonly ExcalidrawElement[] = []) {
    this.elements = initial
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getElements(): readonly ExcalidrawElement[] {
    return this.elements.filter((e) => !e.isDeleted)
  }

  getElementsIncludingDeleted(): readonly ExcalidrawElement[] {
    return this.elements
  }

  protected notify(): void {
    for (const fn of this.listeners) fn()
  }

  protected setElements(next: readonly ExcalidrawElement[]): void {
    this.elements = next
    this.notify()
  }
}
