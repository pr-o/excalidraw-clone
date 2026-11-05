import {
  deleteElements,
  replaceElements,
  type ExcalidrawElement,
  type Scene,
} from "@excalidraw-clone/scene"

/* Scene-level edits, each one `mutate` (so one undo step). */

/** Apply patch-array results (groupElements, lockElements, …): replace each
 *  matching element in the scene with its patched copy. No-op on empty input. */
export function patchScene(scene: Scene, patches: readonly ExcalidrawElement[]): void {
  if (patches.length === 0) return
  scene.mutate((draft) => replaceElements(draft, patches))
}

/** Map every element: `fn` returns its replacement, or undefined to leave it as is. */
export function mapElements(
  scene: Scene,
  fn: (el: ExcalidrawElement) => ExcalidrawElement | undefined,
): void {
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const next = fn(draft[i]!)
      if (next) draft[i] = next
    }
  })
}

/** Soft-delete the elements `ids` (they stay as tombstones for undo). */
export function deleteFromScene(scene: Scene, ids: readonly string[]): void {
  scene.mutate((draft) => deleteElements(draft, ids))
}

/** Z-order change (bringToFront, sendBackward, …) applied to `ids`. */
export function reorderElements(
  scene: Scene,
  fn: (els: readonly ExcalidrawElement[], ids: string[]) => ExcalidrawElement[],
  ids: string[],
): void {
  scene.mutate((draft) => {
    const next = fn(draft, ids)
    draft.length = 0
    draft.push(...next)
  })
}
