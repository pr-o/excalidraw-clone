"use client"
import { expandIdsToGroups, type Scene } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { clientToScene } from "./events"
import { pickElementAtPoint } from "./hitTest"
import { isReadOnly } from "./viewMode"

/** Right-click on the canvas: opens the element menu for the hit (selecting
 *  it, group-expanded, unless already selected) or the canvas menu. */
export function openCanvasContextMenu(
  scene: Scene,
  canvas: HTMLCanvasElement,
  e: MouseEvent,
): void {
  // No editor context menu while presenting; let the browser handle it.
  if (isReadOnly(useAppStore.getState())) {
    // View mode hides the editor menu outright; presenting leaves the browser's.
    if (useAppStore.getState().viewMode) e.preventDefault()
    return
  }
  e.preventDefault()
  const store = useAppStore.getState()
  const scenePoint = clientToScene(canvas, viewOf(store), e)
  const hit = pickElementAtPoint(scene.getElements(), scenePoint, { includeLocked: true })
  if (!hit) {
    store.setContextMenu({ x: e.clientX, y: e.clientY, scenePoint, target: "canvas" })
    return
  }
  if (hit.locked) {
    store.setContextMenu({
      x: e.clientX,
      y: e.clientY,
      scenePoint,
      target: "element",
      elementIds: [hit.id],
      locked: true,
    })
    return
  }
  const alreadySelected = store.selectedIds.includes(hit.id)
  const elementIds = alreadySelected
    ? [...store.selectedIds]
    : expandIdsToGroups([hit.id], scene.getElements())
  if (!alreadySelected) store.setSelection(elementIds)
  store.setContextMenu({
    x: e.clientX,
    y: e.clientY,
    scenePoint,
    target: "element",
    elementIds,
    locked: false,
  })
}
