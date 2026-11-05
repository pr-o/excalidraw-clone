"use client"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { openCanvasContextMenu } from "./canvasContextMenu"
import { createCanvasKeyNav } from "./canvasKeyNav"
import { createDoubleTap } from "./doubleTap"
import { createGuideGesture } from "./guideGesture"
import { LaserTrail } from "./laserTrail"
import { refitFreeText } from "./measureStandaloneText"
import { createPanGesture, createPanState } from "./panGesture"
import { createPointerHandlers } from "./pointerHandlers"
import { syncRendererWithStore } from "./rendererSync"
import { createToolDispatch, NO_MODIFIERS } from "./toolDispatch"
import { createTouchGestures } from "./touchGestures"
import { isReadOnly } from "./viewMode"

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  laserRef: RefObject<HTMLCanvasElement | null>
  onReady?: (renderer: CanvasRenderer) => void
  onTeardown?: () => void
}

/**
 * Caveat is a web font whose faces (upright, italic) load on first use: whenever one
 * finishes loading, re-fit free text measured with the fallback and redraw (earlier
 * frames may have used the fallback). Returns the cleanup.
 */
function refitTextWhenFontsLoad(scene: Scene, renderer: CanvasRenderer): () => void {
  let disposed = false
  const onFontsLoaded = (): void => {
    if (disposed) return
    refitFreeText(scene)
    renderer.requestRedraw()
  }
  void document.fonts?.load('20px "Caveat"').then(onFontsLoaded)
  document.fonts?.addEventListener("loadingdone", onFontsLoaded)
  return () => {
    disposed = true
    document.fonts?.removeEventListener("loadingdone", onFontsLoaded)
  }
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
  // Pan state survives the effect re-running (on a page switch Space may still be held).
  const panStateRef = useRef(createPanState())

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    const laserCanvas = laserRef.current
    if (!canvas || !overlay || !laserCanvas) return

    const laser = new LaserTrail(laserCanvas, () => viewOf(useAppStore.getState()))
    const initial = useAppStore.getState()
    const renderer = new CanvasRenderer(canvas, scene, {
      overlayCanvas: overlay,
      theme: initial.resolvedTheme,
      canvasBg: initial.canvasBg,
    })
    rendererRef.current = renderer
    renderer.setShowUserGuides(initial.rulersVisible && !isReadOnly(initial))
    renderer.setShowMeasurements(initial.measurementsVisible && !isReadOnly(initial))
    renderer.start()
    onReady?.(renderer)
    const stopFontRefit = refitTextWhenFontsLoad(scene, renderer)

    const dispatch = createToolDispatch(scene, renderer, laser)
    const unsubStore = syncRendererWithStore(renderer, laser, dispatch)
    const pan = createPanGesture(canvas, panStateRef.current)
    const guides = createGuideGesture(canvas, scene)
    const doubleTap = createDoubleTap()
    const handleTouch = createTouchGestures(canvas, dispatch, (clientX, clientY) =>
      openCanvasContextMenu(scene, canvas, {
        clientX,
        clientY,
        preventDefault: () => {},
      } as MouseEvent),
    )
    const onCanvasKeyDown = createCanvasKeyNav(canvas, scene, dispatch)

    const { onPointerDown, onPointerMove, onPointerUp, onNativeDoubleClick, onWheel } =
      createPointerHandlers({
        canvas,
        overlay,
        scene,
        dispatch,
        pan,
        guides,
        doubleTap,
        handleTouch,
      })

    const onContextMenu = (e: MouseEvent): void => openCanvasContextMenu(scene, canvas, e)
    const onPointerEnter = (): void => useAppStore.getState().setPointerOverCanvas(true)
    const onPointerLeave = (): void => useAppStore.getState().setPointerOverCanvas(false)
    // CanvasShell resizes the canvas on window resize, which clears its bitmap.
    const onResize = (): void => renderer.requestRedraw()
    const onKeyDown = (e: KeyboardEvent): void => pan.onKeyDown(e)
    const onKeyUp = (e: KeyboardEvent): void => pan.onKeyUp(e)
    const onWindowBlur = (): void => pan.onWindowBlur()

    type Listener = readonly [
      EventTarget,
      string,
      EventListenerOrEventListenerObject,
      AddEventListenerOptions?,
    ]
    const listeners: readonly Listener[] = [
      [window, "resize", onResize],
      [canvas, "pointerdown", onPointerDown as EventListener],
      [canvas, "pointermove", onPointerMove as EventListener],
      [canvas, "pointerup", onPointerUp as EventListener],
      [canvas, "pointercancel", onPointerUp as EventListener],
      [canvas, "dblclick", onNativeDoubleClick as EventListener],
      [canvas, "contextmenu", onContextMenu as EventListener],
      [canvas, "keydown", onCanvasKeyDown as EventListener],
      [canvas, "pointerenter", onPointerEnter],
      [canvas, "pointerleave", onPointerLeave],
      [canvas, "wheel", onWheel as EventListener, { passive: false }],
      [window, "keydown", onKeyDown as EventListener],
      [window, "keyup", onKeyUp as EventListener],
      [window, "blur", onWindowBlur],
    ]
    for (const [target, type, handler, options] of listeners) {
      target.addEventListener(type, handler, options)
    }

    useAppStore.getState().setDispatchToolEvent((e) => dispatch(e, NO_MODIFIERS))

    return () => {
      for (const [target, type, handler, options] of listeners) {
        target.removeEventListener(type, handler, options)
      }
      useAppStore.getState().setPointerOverCanvas(false)
      useAppStore.getState().setDispatchToolEvent(null)
      stopFontRefit()
      handleTouch.dispose()
      unsubStore()
      laser.clear()
      renderer.stop()
      rendererRef.current = null
      onTeardown?.()
    }
  }, [scene, canvasRef, overlayRef, laserRef, onReady, onTeardown])
}
