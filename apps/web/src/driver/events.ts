import {
  snapPointToGrid,
  type GridSnap,
  type Point,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import type { Modifiers, ToolEvent } from "@excalidraw-clone/tools"

export function modifiersOf(e: {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): Modifiers {
  return { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
}

export function clientToScene(
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: PointerEvent | MouseEvent,
): Point {
  const rect = canvas.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  return {
    x: cx / view.zoom - view.scrollX,
    y: cy / view.zoom - view.scrollY,
  }
}

export function snapScenePoint(
  raw: Point,
  grid: GridSnap,
  mods: { ctrlKey: boolean; metaKey: boolean },
): Point {
  return snapPointToGrid(raw, grid, { ctrl: mods.ctrlKey, meta: mods.metaKey })
}

export function pointerEventToToolEvent(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  grid: GridSnap,
  e: PointerEvent,
): ToolEvent {
  const raw = clientToScene(canvas, view, e)
  const at = snapScenePoint(raw, grid, e)
  return { type, at }
}
