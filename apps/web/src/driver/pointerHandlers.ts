import type { Point } from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import {
  applyWheel,
  clientToScene,
  modifiersOf,
  pointerEventToToolEvent,
  snapScenePoint,
} from "./events"
import type { createDoubleTap } from "./doubleTap"
import type { GuideGesture } from "./guideGesture"
import { pickElementAtPoint } from "./hitTest"
import { drawGhost, placeLibraryItem } from "./libraryPlacement"
import { openLink, sanitizeLinkHref } from "./link"
import type { PanGesture } from "./panGesture"
import { resolveGrid, type ToolDispatch } from "./toolDispatch"
import type { createTouchGestures } from "./touchGestures"
import { isReadOnly } from "./viewMode"

/** A native dblclick that follows a synthesized double-tap within this window is a duplicate. */
const DOUBLE_TAP_DEDUPE_MS = 500

export interface PointerEnv {
  canvas: HTMLCanvasElement
  overlay: HTMLCanvasElement
  scene: Scene
  dispatch: ToolDispatch
  pan: PanGesture
  guides: GuideGesture
  doubleTap: ReturnType<typeof createDoubleTap>
  handleTouch: ReturnType<typeof createTouchGestures>
}

/**
 * Routes canvas pointer input. Each press / move / release is offered in turn to the
 * touch layer, the pan gesture, the ruler guides, an armed library item and link clicks,
 * and only what none of them claims reaches the active tool.
 */
export function createPointerHandlers(env: PointerEnv) {
  const { canvas, overlay, scene, dispatch, pan, guides, doubleTap, handleTouch } = env
  let syntheticDoubleTapAt = -Infinity

  const snappedScenePoint = (e: PointerEvent | MouseEvent): Point =>
    snapScenePoint(clientToScene(canvas, viewOf(useAppStore.getState()), e), resolveGrid(), e)

  const dispatchPointer = (
    type: "pointerDown" | "pointerMove" | "pointerUp",
    e: PointerEvent,
  ): void => {
    const store = useAppStore.getState()
    // Presentation mode is read-only. The laser pointer is the one exception:
    // it is a presentation aid and writes nothing to the scene.
    if (isReadOnly(store) && store.activeTool !== "laser") return
    const event = pointerEventToToolEvent(type, canvas, viewOf(store), resolveGrid(), e)
    if ("at" in event) store.setLastScenePointer(event.at)
    dispatch(event, modifiersOf(e))
  }

  /** Opens the link of the element under the pointer. Only an *openable* link swallows
   *  the click; a present-but-unopenable one (typo, rejected scheme) falls through to
   *  normal selection rather than making the element unclickable. */
  const openLinkUnderPointer = (e: PointerEvent): boolean => {
    const at = clientToScene(canvas, viewOf(useAppStore.getState()), e)
    const hit = pickElementAtPoint(scene.getElements(), at)
    if (!hit || !sanitizeLinkHref(hit.link)) return false
    openLink(hit.link)
    return true
  }

  /** Cmd/Ctrl-click on a linked element opens it (selection tool only, so drawing-tool
   *  modifier behaviour is untouched; the modifier is otherwise just "bypass snap").
   *  Apple: Ctrl-click is the system secondary click, so require Cmd there. */
  const isModifierLinkClick = (e: PointerEvent): boolean => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    return useAppStore.getState().activeTool === "selection" && (isApple ? e.metaKey : e.ctrlKey)
  }

  /** Drops an armed library item at the pointer. */
  const placePendingItem = (e: PointerEvent): boolean => {
    const store = useAppStore.getState()
    const pending = store.pendingItem
    if (!pending) return false
    // Read-only while presenting: placing a library item mutates the scene.
    if (isReadOnly(store)) return true
    const at = snappedScenePoint(e)
    placeLibraryItem(pending, at.x, at.y, scene)
    store.clearPendingItem()
    overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
    return true
  }

  const onWheel = (e: WheelEvent): void => {
    // Read-only while presenting: the slide framing owns the viewport.
    if (useAppStore.getState().presenting) return
    e.preventDefault()
    const store = useAppStore.getState()
    store.setView(applyWheel(canvas, viewOf(store), e))
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    if (e.pointerType === "touch") doubleTap.down(e)
    if (handleTouch("down", e)) return
    const store = useAppStore.getState()
    if (store.contextMenu) {
      store.setContextMenu(null)
      return
    }
    pan.clearOrphan(e)
    // View mode: a click on a linked element opens it (no modifier needed).
    if (store.viewMode && !store.presenting && store.activeTool !== "laser") {
      if (openLinkUnderPointer(e)) return
    }
    if (pan.start(e) || guides.start(e) || placePendingItem(e)) return
    if (isModifierLinkClick(e) && openLinkUnderPointer(e)) return
    canvas.setPointerCapture(e.pointerId)
    dispatchPointer("pointerDown", e)
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (handleTouch("move", e) || pan.isOrphan(e) || pan.move(e) || guides.move(e)) return
    if (e.buttons === 0 && !pan.spaceHeld) guides.updateHoverCursor(e)
    const store = useAppStore.getState()
    const pending = store.pendingItem
    if (pending) {
      // Read-only while presenting: no ghost preview on the overlay.
      if (!isReadOnly(store)) drawGhost(overlay, pending, snappedScenePoint(e), viewOf(store))
      return
    }
    // Hover feeds the link indicator; the tool dispatch below is gated off.
    if (store.viewMode) store.setLastScenePointer(clientToScene(canvas, viewOf(store), e))
    dispatchPointer("pointerMove", e)
  }

  const onPointerUp = (e: PointerEvent): void => {
    const isDoubleTap = e.type === "pointerup" && e.pointerType === "touch" && doubleTap.up(e)
    if (handleTouch("up", e) || pan.end(e) || guides.end(e)) return
    if (useAppStore.getState().pendingItem) return
    canvas.releasePointerCapture(e.pointerId)
    dispatchPointer("pointerUp", e)
    if (isDoubleTap) {
      syntheticDoubleTapAt = performance.now()
      onDoubleClick(e)
    }
  }

  const onDoubleClick = (e: MouseEvent): void => {
    // Read-only while presenting (laser has no double-click behaviour).
    if (isReadOnly(useAppStore.getState())) return
    if (guides.removeAt(e)) return
    dispatch({ type: "doubleClick", at: snappedScenePoint(e) }, modifiersOf(e))
  }

  // Browsers that also send a native dblclick for the double-tap must not run it twice.
  const onNativeDoubleClick = (e: MouseEvent): void => {
    if (performance.now() - syntheticDoubleTapAt < DOUBLE_TAP_DEDUPE_MS) return
    onDoubleClick(e)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onNativeDoubleClick,
    onWheel,
  }
}
