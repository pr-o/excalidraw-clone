"use client"
import type { Point, ViewTransform } from "@excalidraw-clone/geometry"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { pinchView } from "./pinch"
import { NO_MODIFIERS, type ToolDispatch } from "./toolDispatch"

/** Two-finger pan/zoom. Once a second touch lands the one-finger gesture is
 *  cancelled and every touch is swallowed until all fingers lift. The returned
 *  handler reports whether the event was consumed by the touch gesture layer. */
export function createTouchGestures(
  canvas: HTMLCanvasElement,
  dispatch: ToolDispatch,
): (type: "down" | "move" | "up", e: PointerEvent) => boolean {
  const touches = new Map<number, Point>()
  let pinch: { ids: [number, number]; view: ViewTransform; from: [Point, Point] } | null = null
  let touchDead = false
  const canvasPoint = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  return (type, e) => {
    if (e.pointerType !== "touch" || useAppStore.getState().presenting) return false
    if (type === "up") {
      touches.delete(e.pointerId)
      pinch = null
      const consumed = touchDead
      if (touches.size === 0) touchDead = false
      if (consumed) canvas.releasePointerCapture(e.pointerId)
      return consumed
    }
    touches.set(e.pointerId, canvasPoint(e))
    if (type === "down" && !touchDead && touches.size === 2) {
      dispatch({ type: "escape" }, NO_MODIFIERS)
      touchDead = true
      const [a, b] = [...touches.keys()] as [number, number]
      const from: [Point, Point] = [touches.get(a)!, touches.get(b)!]
      pinch = { ids: [a, b], view: viewOf(useAppStore.getState()), from }
      canvas.setPointerCapture(e.pointerId)
      return true
    }
    if (touchDead && pinch) {
      const [a, b] = pinch.ids
      const pa = touches.get(a)
      const pb = touches.get(b)
      if (pa && pb) useAppStore.getState().setView(pinchView(pinch.view, pinch.from, [pa, pb]))
    }
    return touchDead
  }
}
