import { reconcileBindings } from "./bindings"
import { buildExcalidrawData } from "./json"
import { reconcileBoundText } from "./reconcile-bound-text"
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawElement,
  ExcalidrawFiles,
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
    this.setElements(draft)
    if (!opts?.skipHistory) this.pushHistory(draft)
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

  protected resetHistory(snapshot: readonly ExcalidrawElement[]): void {
    this.history = [snapshot]
    this.historyIndex = 0
  }

  toJSON(appState?: ExcalidrawAppStateSnapshot, files?: ExcalidrawFiles): ExcalidrawData {
    return buildExcalidrawData(this.elements, appState, files)
  }

  loadFromJSON(data: ExcalidrawData): {
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
