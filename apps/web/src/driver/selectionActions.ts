import {
  duplicateElements,
  flipElements,
  groupElements,
  lockElements,
  type Scene,
  ungroupElements,
} from "@excalidraw-clone/scene"
import { useAppStore } from "../store"
import { selectableIds } from "./clipboard"
import { deleteFromScene, patchScene } from "./patchScene"

/**
 * Selection-level scene edits shared by the keyboard shortcuts, the properties
 * panel, the context menu and the command palette, so every entry point behaves
 * identically (same selection afterwards, same guards).
 */

export function duplicateSelection(scene: Scene, ids: readonly string[]): void {
  if (ids.length === 0) return
  const copies = duplicateElements(scene.getElements(), ids)
  scene.mutate((draft) => {
    draft.push(...copies)
  })
  useAppStore.getState().setSelection(selectableIds(copies))
}

export function deleteSelection(scene: Scene, ids: readonly string[]): void {
  if (ids.length === 0) return
  deleteFromScene(scene, ids)
  useAppStore.getState().setSelection([])
}

export function groupSelection(scene: Scene, ids: readonly string[]): void {
  patchScene(scene, groupElements(scene.getElements(), ids, crypto.randomUUID()))
}

export function ungroupSelection(scene: Scene, ids: readonly string[]): void {
  patchScene(scene, ungroupElements(scene.getElements(), ids))
}

/** Locks the selection; locked elements cannot be selected, so the selection is cleared. */
export function lockSelection(scene: Scene, ids: readonly string[]): void {
  if (ids.length === 0) return
  patchScene(scene, lockElements(scene.getElements(), ids))
  useAppStore.getState().setSelection([])
}

export function flipSelection(scene: Scene, ids: readonly string[], axis: "x" | "y"): void {
  patchScene(scene, flipElements(scene.getElements(), ids, axis))
}
