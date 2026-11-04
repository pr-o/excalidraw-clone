"use client"
import type { Point, ViewTransform } from "@excalidraw-clone/geometry"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { pinchView } from "./pinch"
import { NO_MODIFIERS, type ToolDispatch } from "./toolDispatch"

/** Hold still this long (ms) with one finger under the selection tool for the context menu. */
export const LONG_PRESS_MS = 500
/** Finger drift (px) that turns a would-be long-press into a drag. */
const LONG_PRESS_SLOP = 10

/** Two-finger pan/zoom, plus one-finger long-press → `onLongPress` (touch has no
 *  right-click). Once a second touch lands, or a long-press fires, the one-finger
 *  gesture is cancelled and every touch is swallowed until all fingers lift. The
 *  returned handler reports whether the event was consumed by the touch gesture layer. */
export function createTouchGestures(
  canvas: HTMLCanvasElement,
  dispatch: ToolDispatch,
  onLongPress?: (clientX: number, clientY: number) => void,
): ((type: "down" | "move" | "up", e: PointerEvent) => boolean) & { dispose: () => void } {
  const touches = new Map<number, Point>()
  let pinch: { ids: [number, number]; view: ViewTransform; from: [Point, Point] } | null = null
  let touchDead = false
  let longPress: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
  const cancelLongPress = (): void => {
    if (longPress) clearTimeout(longPress.timer)
    longPress = null
  }
  const canvasPoint = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const handle = (type: "down" | "move" | "up", e: PointerEvent): boolean => {
    if (e.pointerType !== "touch" || useAppStore.getState().presenting) return false
    if (type === "up") {
      cancelLongPress()
      touches.delete(e.pointerId)
      pinch = null
      const consumed = touchDead
      if (touches.size === 0) touchDead = false
      if (consumed) canvas.releasePointerCapture(e.pointerId)
      return consumed
    }
    touches.set(e.pointerId, canvasPoint(e))
    if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > LONG_PRESS_SLOP)
      cancelLongPress()
    if (type === "down" && touches.size > 1) cancelLongPress()
    const store = useAppStore.getState()
    if (
      type === "down" &&
      onLongPress &&
      touches.size === 1 &&
      store.activeTool === "selection" &&
      !store.viewMode
    ) {
      const { clientX: x, clientY: y } = e
      longPress = {
        x,
        y,
        timer: setTimeout(() => {
          longPress = null
          dispatch({ type: "escape" }, NO_MODIFIERS)
          touchDead = true
          onLongPress(x, y)
        }, LONG_PRESS_MS),
      }
    }
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
  // A pending long-press must not fire after the driver is torn down.
  return Object.assign(handle, { dispose: cancelLongPress })
}
