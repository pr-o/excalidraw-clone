import type { UserGuides } from "@excalidraw-clone/geometry"
import { reconcileBindings } from "./bindings"
import type { Comment } from "./comments"
import { reconcileFrameMembership } from "./frames"
import { reconcileBoundText } from "./reconcile-bound-text"
import { reconcileTables } from "./table"
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawElement,
  ExcalidrawFiles,
  SceneSnapshot,
} from "./types"

export interface MutateOptions {
  skipHistory?: boolean
}

const NO_GUIDES: UserGuides = { x: [], y: [] }

export class Scene {
  private elements: readonly ExcalidrawElement[]
  private listeners = new Set<() => void>()
  private history: readonly (readonly ExcalidrawElement[])[]
  private historyIndex: number
  /** User ruler guides. Deliberately outside the undo stack: guide
   *  create/move/delete is view scaffolding, not drawing, so undo/redo and
   *  history jumps never touch it. */
  private guides: UserGuides
  /** Comment threads on this page; outside the undo stack like guides. */
  private comments: readonly Comment[]
  private static readonly MAX_HISTORY = 100

  constructor(
    initial: readonly ExcalidrawElement[] = [],
    guides: UserGuides = NO_GUIDES,
    comments: readonly Comment[] = [],
  ) {
    this.elements = initial
    this.guides = guides
    this.comments = comments
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
    // Called many times per frame (renderer, hit-testing, React views): filter once per
    // elements array. Safe because `elements` is replaced, never mutated in place.
    if (this.liveSource !== this.elements) {
      this.liveSource = this.elements
      this.live = this.elements.filter((e) => !e.isDeleted)
    }
    return this.live
  }
  private reconciled = new WeakSet<readonly ExcalidrawElement[]>()
  private liveSource: readonly ExcalidrawElement[] | null = null
  private live: readonly ExcalidrawElement[] = []

  getGuides(): UserGuides {
    return this.guides
  }

  setGuides(guides: UserGuides): void {
    this.guides = guides
    this.notify()
  }

  getComments(): readonly Comment[] {
    return this.comments
  }

  setComments(comments: readonly Comment[]): void {
    this.comments = comments
    this.notify()
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
    reconcileTables(draft, this.elements)
    reconcileBindings(draft)
    // Arrays produced here are fully reconciled; the next mutate can then skip
    // re-checking frame membership of elements it carries over untouched.
    reconcileFrameMembership(draft, this.reconciled.has(this.elements) ? this.elements : undefined)
    this.reconciled.add(draft)
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
    // Structural sharing: unchanged elements keep their reference, so only the
    // replaced ones need a value comparison (not two whole-scene stringifies).
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false
    }
    return true
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

  /** History-silent normalisation (e.g. re-fitting text once a web font loads):
   *  `fix` is applied to the live elements AND every undo snapshot, so neither
   *  the next commit nor an undo sees a difference. Return the element itself
   *  to leave it unchanged; nothing is notified when nothing changed. */
  normalize(fix: (element: ExcalidrawElement) => ExcalidrawElement): void {
    const memo = new Map<ExcalidrawElement, ExcalidrawElement>()
    let changed = false
    const apply = (list: readonly ExcalidrawElement[]): readonly ExcalidrawElement[] => {
      let listChanged = false
      const next = list.map((e) => {
        let fixed = memo.get(e)
        if (!fixed) {
          fixed = fix(e)
          memo.set(e, fixed)
        }
        if (fixed !== e) listChanged = true
        return fixed
      })
      changed ||= listChanged
      return listChanged ? next : list
    }
    const history = this.history.map(apply)
    const elements = apply(this.elements)
    if (!changed) return
    this.history = history
    this.setElements(elements)
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
