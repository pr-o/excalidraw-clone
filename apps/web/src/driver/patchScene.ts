import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"

/** Apply patch-array results (groupElements, lockElements, …): replace each
 *  matching element in the scene with its patched copy. No-op on empty input. */
export function patchScene(scene: Scene, patches: readonly ExcalidrawElement[]): void {
  if (patches.length === 0) return
  const byId = new Map(patches.map((p) => [p.id, p]))
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const p = byId.get(draft[i]!.id)
      if (p) draft[i] = p
    }
  })
}

/** Replace elements in place: `fn` returns the new element, or undefined to leave it as is. */
export function replaceElements(
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

/** Soft-delete every element whose id is in `ids`. */
export function deleteElements(scene: Scene, ids: readonly string[]): void {
  replaceElements(scene, (el) => (ids.includes(el.id) ? { ...el, isDeleted: true } : undefined))
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
