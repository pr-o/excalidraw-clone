"use client"
import { hitTestUserGuide, type Point } from "@excalidraw-clone/geometry"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import { findHandleAt } from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { openCanvasContextMenu } from "./canvasContextMenu"
import {
  applyWheel,
  clientToScene,
  modifiersOf,
  pointerEventToToolEvent,
  snapScenePoint,
} from "./events"
import { pickElementAtPoint } from "./hitTest"
import { LaserTrail } from "./laserTrail"
import { refitFreeText } from "./measureStandaloneText"
import { drawGhost, placeLibraryItem } from "./libraryPlacement"
import { openLink, sanitizeLinkHref } from "./link"
import { syncRendererWithStore } from "./rendererSync"
import { createToolDispatch, NO_MODIFIERS, resolveGrid } from "./toolDispatch"
import { createTouchGestures } from "./touchGestures"
import { applyGuideDrag, guideValueAt, type GuideDrag } from "./userGuides"
import { isReadOnly } from "./viewMode"

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  laserRef: RefObject<HTMLCanvasElement | null>
  onReady?: (renderer: CanvasRenderer) => void
  onTeardown?: () => void
}

export function useDrawingDriver({
  scene,
  canvasRef,
  overlayRef,
  laserRef,
  onReady,
  onTeardown,
}: DriverOptions): void {
  const rendererRef = useRef<CanvasRenderer | null>(null)
  const spaceHeldRef = useRef(false)
  const panDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startScrollX: number
    startScrollY: number
  } | null>(null)
  // When Space is released mid-pan while the pointer is still down, the tool
  // never received a matching pointerDown for this gesture. Mark the pointer as
  // orphaned so its remaining move/up events are suppressed until it lifts,
  // preventing a phantom (move + up without down) dispatch into the active tool.
  const orphanedPointerRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const laserCanvas = laserRef.current
    if (!laserCanvas) return
    const laser = new LaserTrail(laserCanvas, () => viewOf(useAppStore.getState()))

    const initial = useAppStore.getState()
    const renderer = new CanvasRenderer(canvas, scene, {
      overlayCanvas: overlay,
      theme: initial.resolvedTheme,
      canvasBg: initial.canvasBg,
    })
    rendererRef.current = renderer
    renderer.setShowUserGuides(initial.rulersVisible && !isReadOnly(initial))
    renderer.start()
    onReady?.(renderer)
    // CanvasShell resizes the canvas on window resize, which clears its bitmap.
    const onResize = (): void => renderer.requestRedraw()
    window.addEventListener("resize", onResize)
    // Caveat is a web font whose faces (upright, italic) load on first use:
    // whenever one finishes loading, re-fit free text measured with the
    // fallback and redraw (earlier frames may have used the fallback).
    let disposed = false
    const onFontsLoaded = (): void => {
      if (disposed) return
      refitFreeText(scene)
      renderer.requestRedraw()
    }
    void document.fonts?.load('20px "Caveat"').then(onFontsLoaded)
    document.fonts?.addEventListener("loadingdone", onFontsLoaded)

    const dispatch = createToolDispatch(scene, renderer, laser)
    const unsubStore = syncRendererWithStore(renderer, laser, dispatch)

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

    const onWheel = (e: WheelEvent): void => {
      // Read-only while presenting: the slide framing owns the viewport.
      if (useAppStore.getState().presenting) return
      e.preventDefault()
      const store = useAppStore.getState()
      store.setView(applyWheel(canvas, viewOf(store), e))
    }

    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (
        e.code !== "Space" ||
        isTypingTarget(e.target) ||
        spaceHeldRef.current ||
        // No Space-drag panning while presenting: the viewport is read-only.
        useAppStore.getState().presenting
      ) {
        return
      }
      spaceHeldRef.current = true
      if (!panDragRef.current) canvas.style.cursor = "grab"
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return
      spaceHeldRef.current = false
      const drag = panDragRef.current
      if (drag) {
        // Pointer is still down mid-pan: orphan it so the rest of this gesture
        // never leaks into dispatchPointer as a down-less move/up pair.
        orphanedPointerRef.current = drag.pointerId
        canvas.releasePointerCapture(drag.pointerId)
      }
      panDragRef.current = null
      canvas.style.cursor = ""
    }

    const handleTouch = createTouchGestures(canvas, dispatch, (clientX, clientY) =>
      openCanvasContextMenu(scene, canvas, {
        clientX,
        clientY,
        preventDefault: () => {},
      } as MouseEvent),
    )

    // Ruler guides on the canvas: only the exact line (4px) captures the
    // pointer, only with the selection tool and rulers shown, so elements
    // beneath stay selectable everywhere else.
    let guideDrag: GuideDrag | null = null
    let guideCursor = false
    const guideAt = (e: MouseEvent): { axis: "x" | "y"; index: number } | null => {
      const store = useAppStore.getState()
      if (!store.rulersVisible || isReadOnly(store) || store.activeTool !== "selection") return null
      const at = clientToScene(canvas, viewOf(store), e)
      return hitTestUserGuide(scene.getGuides(), at, store.zoom)
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return
      if (handleTouch("down", e)) return
      if (useAppStore.getState().contextMenu) {
        useAppStore.getState().setContextMenu(null)
        return
      }
      // A fresh, real pointerDown for this id proves any lingering orphaned
      // state is stale (e.g. the orphaned gesture's pointerUp landed on a UI
      // sibling after capture was released, so our up handler never fired).
      // Clear it so this new gesture is never wrongly suppressed.
      if (orphanedPointerRef.current === e.pointerId) orphanedPointerRef.current = null
      // `spaceHeldRef` can still be set from a Space held down before
      // presentation started, so gate the pan gesture here too.
      const vs = useAppStore.getState()
      if (vs.viewMode && !vs.presenting && vs.activeTool !== "laser") {
        // View mode: a click on a linked element opens it (no modifier needed).
        const hit = pickElementAtPoint(scene.getElements(), clientToScene(canvas, viewOf(vs), e))
        if (hit && sanitizeLinkHref(hit.link)) {
          openLink(hit.link)
          return
        }
      }
      // Left-drag on empty canvas pans in view mode (hand-tool behaviour).
      const panWanted = spaceHeldRef.current || (vs.viewMode && vs.activeTool !== "laser")
      if (panWanted && !vs.presenting) {
        canvas.setPointerCapture(e.pointerId)
        const store = useAppStore.getState()
        panDragRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startScrollX: store.scrollX,
          startScrollY: store.scrollY,
        }
        canvas.style.cursor = "grabbing"
        return
      }
      const guideHit = guideAt(e)
      if (guideHit) {
        canvas.setPointerCapture(e.pointerId)
        guideDrag = guideHit
        return
      }
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        // Read-only while presenting: placing a library item mutates the scene.
        if (isReadOnly(store)) return
        const at = snappedScenePoint(e)
        placeLibraryItem(pending, at.x, at.y, scene)
        store.clearPendingItem()
        overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
        return
      }
      // Cmd/Ctrl-click on a linked element opens its link (selection tool only,
      // so drawing-tool modifier behavior is untouched; Cmd/Ctrl is otherwise
      // just "bypass snap" at drag time and does not change a plain click).
      // Apple: Ctrl-click is the system secondary click, so require Cmd there;
      // elsewhere require Ctrl.
      const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const openModifier = isApple ? e.metaKey : e.ctrlKey
      if (store.activeTool === "selection" && openModifier) {
        const at = clientToScene(canvas, viewOf(store), e)
        const hit = pickElementAtPoint(scene.getElements(), at)
        // Only an *openable* link swallows the click; a present-but-unopenable
        // one (typo, rejected scheme) falls through to normal selection rather
        // than making the element unclickable.
        if (hit && sanitizeLinkHref(hit.link)) {
          openLink(hit.link)
          return
        }
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (handleTouch("move", e)) return
      if (orphanedPointerRef.current === e.pointerId) return
      const drag = panDragRef.current
      if (drag) {
        const store = useAppStore.getState()
        const dx = (e.clientX - drag.startClientX) / store.zoom
        const dy = (e.clientY - drag.startClientY) / store.zoom
        store.setView({
          scrollX: drag.startScrollX + dx,
          scrollY: drag.startScrollY + dy,
          zoom: store.zoom,
        })
        return
      }
      if (guideDrag) {
        const r = canvas.getBoundingClientRect()
        const vp = { x: e.clientX - r.left, y: e.clientY - r.top }
        const value = guideValueAt(guideDrag.axis, vp, viewOf(useAppStore.getState()))
        guideDrag = applyGuideDrag(scene, guideDrag, value)
        return
      }
      if (e.buttons === 0 && !spaceHeldRef.current) {
        const hover = guideAt(e)
        // A selected table's column/row border also shows a resize cursor.
        const vs = useAppStore.getState()
        const border =
          !hover && vs.activeTool === "selection" && vs.selectedIds.length === 1
            ? findHandleAt(
                clientToScene(canvas, viewOf(vs), e),
                vs.selectedIds,
                scene.getElements(),
                viewOf(vs),
              )
            : null
        const axis = hover ? hover.axis : border?.kind === "tableBorder" ? border.axis : null
        if (axis !== null || guideCursor) {
          canvas.style.cursor =
            axis === null ? "" : axis === "x" || axis === "col" ? "col-resize" : "row-resize"
          guideCursor = axis !== null
        }
      }
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        // Read-only while presenting: no ghost preview on the overlay.
        if (isReadOnly(store)) return
        drawGhost(overlay, pending, snappedScenePoint(e), viewOf(store))
        return
      }
      // Hover feeds the link indicator; the tool dispatch below is gated off.
      if (store.viewMode) store.setLastScenePointer(clientToScene(canvas, viewOf(store), e))
      dispatchPointer("pointerMove", e)
    }
    const onPointerUp = (e: PointerEvent): void => {
      if (handleTouch("up", e)) return
      if (orphanedPointerRef.current === e.pointerId) {
        // End of the orphaned gesture: clear the mark so a fresh press works
        // normally, and swallow this up so no down-less pointerUp is dispatched.
        orphanedPointerRef.current = null
        canvas.releasePointerCapture(e.pointerId)
        return
      }
      if (panDragRef.current) {
        panDragRef.current = null
        canvas.releasePointerCapture(e.pointerId)
        canvas.style.cursor = spaceHeldRef.current ? "grab" : ""
        return
      }
      if (guideDrag) {
        guideDrag = null
        canvas.releasePointerCapture(e.pointerId)
        return
      }
      if (useAppStore.getState().pendingItem) return
      canvas.releasePointerCapture(e.pointerId)
      dispatchPointer("pointerUp", e)
    }
    const onDoubleClick = (e: MouseEvent): void => {
      // Read-only while presenting (laser has no double-click behaviour).
      if (isReadOnly(useAppStore.getState())) return
      const guideHit = guideAt(e)
      if (guideHit) {
        applyGuideDrag(scene, guideHit, null)
        return
      }
      dispatch({ type: "doubleClick", at: snappedScenePoint(e) }, modifiersOf(e))
    }

    const onContextMenu = (e: MouseEvent): void => openCanvasContextMenu(scene, canvas, e)

    const onPointerEnter = (): void => useAppStore.getState().setPointerOverCanvas(true)
    const onPointerLeave = (): void => useAppStore.getState().setPointerOverCanvas(false)

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("contextmenu", onContextMenu)
    canvas.addEventListener("pointerenter", onPointerEnter)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    useAppStore.getState().setDispatchToolEvent((e) => dispatch(e, NO_MODIFIERS))

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("contextmenu", onContextMenu)
      canvas.removeEventListener("pointerenter", onPointerEnter)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      useAppStore.getState().setPointerOverCanvas(false)
      canvas.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      useAppStore.getState().setDispatchToolEvent(null)
      disposed = true
      document.fonts?.removeEventListener("loadingdone", onFontsLoaded)
      window.removeEventListener("resize", onResize)
      unsubStore()
      laser.clear()
      renderer.stop()
      rendererRef.current = null
      onTeardown?.()
    }
  }, [scene, canvasRef, overlayRef, laserRef, onReady, onTeardown])
}
