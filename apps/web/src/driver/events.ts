import type { Point, ViewTransform } from "@excalidraw-clone/geometry"
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

export function pointerEventToToolEvent(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: PointerEvent,
): ToolEvent {
  return { type, at: clientToScene(canvas, view, e) }
}
