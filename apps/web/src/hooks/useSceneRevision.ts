import type { Scene } from "@excalidraw-clone/scene"
import { useCallback, useRef, useSyncExternalStore } from "react"

/**
 * Returns a number that increments every time `scene` notifies its listeners
 * (i.e. on every mutation, undo/redo, or load). Use it as a `useMemo`/`useEffect`
 * dependency to make React-derived views of the scene (e.g. the set of selected
 * elements) recompute on live edits — the `Scene` object reference itself is
 * stable across mutations, so it cannot serve that role on its own.
 */
export function useSceneRevision(scene: Scene): number {
  const revisionRef = useRef(0)
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      scene.subscribe(() => {
        revisionRef.current += 1
        onStoreChange()
      }),
    [scene],
  )
  // getSnapshot must be referentially stable and only change value after a
  // notification; reading the ref satisfies both. getServerSnapshot returns a
  // constant for the static prerender pass.
  return useSyncExternalStore(
    subscribe,
    () => revisionRef.current,
    () => 0,
  )
}
