import type { ExcalidrawElement } from "./types"

export interface MutateOptions {
  skipHistory?: boolean
}

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

  /**
   * Mutate the scene by replacing elements in a shallow draft array.
   *
   * The draft is a shallow copy of the elements array. To change an element,
   * replace it with a new object (e.g. `draft[i] = { ...draft[i], x: 10 }`).
   * Do NOT mutate elements in place — that breaks the structural-sharing
   * invariant relied on by reference-comparing listeners.
   */
  mutate(fn: (draft: ExcalidrawElement[]) => void, opts?: MutateOptions): void {
    const draft = [...this.elements]
    fn(draft)
    this.setElements(draft)
    if (!opts?.skipHistory) this.pushHistory(draft)
  }

  protected pushHistory(_snapshot: readonly ExcalidrawElement[]): void {
    // stub — replaced in Phase 3.7
  }

  protected notify(): void {
    for (const fn of this.listeners) fn()
  }

  protected setElements(next: readonly ExcalidrawElement[]): void {
    this.elements = next
    this.notify()
  }
}
