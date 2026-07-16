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
