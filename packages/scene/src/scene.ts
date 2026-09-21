import { reconcileBindings } from "./bindings"
import { reconcileFrameMembership } from "./frames"
import { reconcileBoundText } from "./reconcile-bound-text"
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawElement,
  ExcalidrawFiles,
  SceneSnapshot,
} from "./types"

export interface MutateOptions {
  skipHistory?: boolean
}

export class Scene {
  private elements: readonly ExcalidrawElement[]
  private listeners = new Set<() => void>()
  private history: readonly (readonly ExcalidrawElement[])[]
  private historyIndex: number
  private static readonly MAX_HISTORY = 100

  constructor(initial: readonly ExcalidrawElement[] = []) {
    this.elements = initial
    this.history = [initial]
    this.historyIndex = 0
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
    reconcileBoundText(draft)
    reconcileBindings(draft)
    reconcileFrameMembership(draft)
    this.setElements(draft)
    // A value-identical commit (e.g. a plain click-to-select, which replaces an
    // element with an unchanged clone) must not pollute the undo stack — under
    // MAX_HISTORY such no-ops can otherwise evict every real entry.
    //
    // The baseline is the last snapshot actually recorded on the undo stack,
    // NOT `this.elements`: in-flight `skipHistory: true` drafting (every
    // pointer-move frame of a draw or drag) advances `this.elements` ahead of
    // the undo stack, so comparing against live state would silently drop a
    // gesture's final commit whenever it matched its own last draft frame.
    if (!opts?.skipHistory) {
      const recorded = this.history[this.historyIndex]
      if (!recorded || !Scene.isSameSnapshot(recorded, draft)) this.pushHistory(draft)
    }
  }

  /** Deep value-equality for two element snapshots (plain JSON-safe objects). */
  private static isSameSnapshot(
    a: readonly ExcalidrawElement[],
    b: readonly ExcalidrawElement[],
  ): boolean {
    if (a === b) return true
    if (a.length !== b.length) return false
    return JSON.stringify(a) === JSON.stringify(b)
  }

  protected pushHistory(snapshot: readonly ExcalidrawElement[]): void {
    const truncated = this.history.slice(0, this.historyIndex + 1)
    const next = [...truncated, snapshot]
    const capped =
      next.length > Scene.MAX_HISTORY ? next.slice(next.length - Scene.MAX_HISTORY) : next
    this.history = capped
    this.historyIndex = capped.length - 1
  }

  undo(): void {
    if (!this.canUndo()) return
    this.historyIndex -= 1
    this.setElements(this.history[this.historyIndex]!)
  }

  redo(): void {
    if (!this.canRedo()) return
    this.historyIndex += 1
    this.setElements(this.history[this.historyIndex]!)
  }

  canUndo(): boolean {
    return this.historyIndex > 0
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1
  }

  getHistory(): readonly (readonly ExcalidrawElement[])[] {
    return this.history
  }

  getHistoryIndex(): number {
    return this.historyIndex
  }

  jumpToHistory(index: number): void {
    if (index < 0 || index >= this.history.length) return
    this.historyIndex = index
    this.setElements(this.history[index]!)
  }

  protected resetHistory(snapshot: readonly ExcalidrawElement[]): void {
    this.history = [snapshot]
    this.historyIndex = 0
  }

  toJSON(appState?: ExcalidrawAppStateSnapshot, files?: ExcalidrawFiles): SceneSnapshot {
    return {
      elements: this.elements,
      ...(appState ? { appState } : {}),
      ...(files ? { files } : {}),
    }
  }

  loadFromJSON(data: SceneSnapshot): {
    appState?: ExcalidrawAppStateSnapshot
    files?: ExcalidrawFiles
  } {
    this.setElements(data.elements)
    this.resetHistory(data.elements)
    return {
      ...(data.appState ? { appState: data.appState } : {}),
      ...(data.files ? { files: data.files } : {}),
    }
  }

  protected notify(): void {
    for (const fn of this.listeners) fn()
  }

  protected setElements(next: readonly ExcalidrawElement[]): void {
    this.elements = next
    this.notify()
  }
}
