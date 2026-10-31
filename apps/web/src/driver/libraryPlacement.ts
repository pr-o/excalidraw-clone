"use client"
import { sceneToViewport, type ViewTransform } from "@excalidraw-clone/geometry"
import { putFile } from "@excalidraw-clone/persistence"
import {
  cloneElementsWithNewIds,
  type ExcalidrawElement,
  type LibraryItem,
  type Scene,
} from "@excalidraw-clone/scene"
import { useAppStore } from "../store"

const GHOST_STROKE = "#6b46c1"

/** Drops a copy of `item` (fresh ids, files stored) with its origin at (x, y) and selects it. */
export function placeLibraryItem(item: LibraryItem, x: number, y: number, scene: Scene): void {
  if (item.files) {
    for (const bin of Object.values(item.files)) {
      void putFile(bin)
    }
  }
  const placed: ExcalidrawElement[] = cloneElementsWithNewIds(item.elements).map((el) => ({
    ...el,
    x: el.x + x,
    y: el.y + y,
  }))
  scene.mutate((draft) => {
    draft.push(...placed)
  })
  useAppStore.getState().setSelection(placed.map((e) => e.id))
}

/** Outline preview of an armed library item at the pointer, on the overlay canvas. */
export function drawGhost(
  overlay: HTMLCanvasElement,
  item: LibraryItem,
  scenePoint: { x: number; y: number },
  view: ViewTransform,
): void {
  const ctx = overlay.getContext("2d")
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  ctx.save()
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = GHOST_STROKE
  ctx.lineWidth = 1
  for (const el of item.elements) {
    const tl = sceneToViewport({ x: el.x + scenePoint.x, y: el.y + scenePoint.y }, view)
    const w = (el.width ?? 10) * view.zoom
    const h = (el.height ?? 10) * view.zoom
    ctx.strokeRect(tl.x, tl.y, w, h)
  }
  ctx.restore()
}
