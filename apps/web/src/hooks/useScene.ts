import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import { useCallback, useSyncExternalStore } from "react"

/**
 * Subscribes to `scene` and returns `read(scene)`, re-rendering whenever it changes.
 *
 * The Scene object is mutable and keeps its identity across edits, but every getter
 * it offers returns an immutable value that is replaced on change (elements, history,
 * guides, comments). Those values are therefore valid `useSyncExternalStore` snapshots
 * and can be used directly as `useMemo` / `useEffect` dependencies — no revision
 * counter needed. `read` must return one of those stored values, not a fresh object.
 */
export function useSceneSnapshot<T>(scene: Scene, read: (scene: Scene) => T): T {
  const subscribe = useCallback((onChange: () => void) => scene.subscribe(onChange), [scene])
  const snapshot = (): T => read(scene)
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

const liveElements = (s: Scene): readonly ExcalidrawElement[] => s.getElements()

/** The scene's live (non-deleted) elements; a new array exactly when they change. */
export const useSceneElements = (scene: Scene): readonly ExcalidrawElement[] =>
  useSceneSnapshot(scene, liveElements)
