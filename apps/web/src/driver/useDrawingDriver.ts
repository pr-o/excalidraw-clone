"use client"
import { sceneToViewport, type GridSnap } from "@excalidraw-clone/geometry"
import { putFile } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  cloneElementsWithNewIds,
  hitTestElement,
  type ExcalidrawElement,
  type LibraryItem,
  type Scene,
} from "@excalidraw-clone/scene"
import {
  TOOLS,
  type AnyToolEvent,
  type LinearState,
  type Modifiers,
  type SelectionState,
  type ToolContext,
} from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { applyEffects } from "./effects"
import {
  applyWheel,
  clientToScene,
  modifiersOf,
  pointerEventToToolEvent,
  snapScenePoint,
} from "./events"

const GHOST_STROKE = "#6b46c1"

const SNAPPABLE_TOOLS: ReadonlySet<string> = new Set([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
])

function placeLibraryItem(item: LibraryItem, x: number, y: number, scene: Scene): void {
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

function drawGhost(
  overlay: HTMLCanvasElement,
  item: LibraryItem,
  scenePoint: { x: number; y: number },
  view: { scrollX: number; scrollY: number; zoom: number },
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

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  onReady?: (renderer: CanvasRenderer) => void
  onTeardown?: () => void
}

export function useDrawingDriver({
  scene,
  canvasRef,
  overlayRef,
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

    const initial = useAppStore.getState()
    const renderer = new CanvasRenderer(canvas, scene, {
      overlayCanvas: overlay,
      theme: initial.resolvedTheme,
      canvasBg: initial.canvasBg,
    })
    rendererRef.current = renderer
    renderer.start()
    onReady?.(renderer)

    const unsubStore = useAppStore.subscribe((s, prev) => {
      if (s.resolvedTheme !== prev.resolvedTheme) renderer.setTheme(s.resolvedTheme)
      if (s.canvasBg !== prev.canvasBg) renderer.setCanvasBg(s.canvasBg)
      if (s.scrollX !== prev.scrollX || s.scrollY !== prev.scrollY || s.zoom !== prev.zoom) {
        renderer.setViewTransform({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom })
      }
      if (s.gridEnabled !== prev.gridEnabled || s.gridSize !== prev.gridSize) {
        renderer.setGrid({ enabled: s.gridEnabled, size: s.gridSize })
      }
      if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)
    })

    const resolveGrid = (): GridSnap => {
      const s = useAppStore.getState()
      return {
        enabled: s.gridEnabled && SNAPPABLE_TOOLS.has(s.activeTool),
        size: s.gridSize,
      }
    }

    const dispatch = (event: AnyToolEvent, modifiers: Modifiers): void => {
      const store = useAppStore.getState()
      const toolName = store.activeTool
      const tool = TOOLS[toolName]
      const currentState = store.toolStates[toolName] ?? tool.initial
      const ctx: ToolContext = {
        readElements: () => scene.getElements(),
        hitTest: (at) => {
          // Frames are lowest-priority: members inside a frame win, the frame
          // itself only catches clicks on its empty interior.
          const elements = scene.getElements()
          let frameHit: ExcalidrawElement | null = null
          for (let i = elements.length - 1; i >= 0; i -= 1) {
            const el = elements[i] as ExcalidrawElement
            if (el.type === "text" && el.containerId !== null) continue
            if (el.locked) continue
            if (!hitTestElement(el, at)) continue
            if (el.type === "frame") {
              frameHit = frameHit ?? el
              continue
            }
            return el
          }
          return frameHit
        },
        viewTransform: { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        modifiers,
        selectedIds: store.selectedIds,
        grid: resolveGrid(),
      }
      const [next, effects] = tool.reduce(currentState, event, ctx)
      useAppStore.getState().setToolState(toolName, next)
      applyEffects(scene, effects)
      if (toolName === "arrow" && (next as LinearState).phase === "drawing") {
        const cand = (next as Extract<LinearState, { phase: "drawing" }>).endBindId
        renderer.setBindingHighlight(cand ? [cand] : [])
      } else if (
        toolName === "selection" &&
        (next as SelectionState).phase === "endpointDragging"
      ) {
        const cand = (next as Extract<SelectionState, { phase: "endpointDragging" }>)
          .candidateBindId
        renderer.setBindingHighlight(cand ? [cand] : [])
      } else {
        renderer.setBindingHighlight([])
      }
    }

    const dispatchPointer = (
      type: "pointerDown" | "pointerMove" | "pointerUp",
      e: PointerEvent,
    ): void => {
      const store = useAppStore.getState()
      const event = pointerEventToToolEvent(
        type,
        canvas,
        { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        resolveGrid(),
        e,
      )
      if ("at" in event) store.setLastScenePointer(event.at)
      dispatch(event, modifiersOf(e))
    }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const store = useAppStore.getState()
      const next = applyWheel(
        canvas,
        { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        e,
      )
      store.setView(next)
    }

    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Space" || isTypingTarget(e.target) || spaceHeldRef.current) return
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

    const onPointerDown = (e: PointerEvent): void => {
      // A fresh, real pointerDown for this id proves any lingering orphaned
      // state is stale (e.g. the orphaned gesture's pointerUp landed on a UI
      // sibling after capture was released, so our up handler never fired).
      // Clear it so this new gesture is never wrongly suppressed.
      if (orphanedPointerRef.current === e.pointerId) orphanedPointerRef.current = null
      if (spaceHeldRef.current) {
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
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        const raw = clientToScene(
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e,
        )
        const at = snapScenePoint(raw, resolveGrid(), e)
        placeLibraryItem(pending, at.x, at.y, scene)
        store.clearPendingItem()
        overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
        return
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => {
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
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        const raw = clientToScene(
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e,
        )
        const at = snapScenePoint(raw, resolveGrid(), e)
        drawGhost(overlay, pending, at, {
          scrollX: store.scrollX,
          scrollY: store.scrollY,
          zoom: store.zoom,
        })
        return
      }
      dispatchPointer("pointerMove", e)
    }
    const onPointerUp = (e: PointerEvent): void => {
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
      if (useAppStore.getState().pendingItem) return
      canvas.releasePointerCapture(e.pointerId)
      dispatchPointer("pointerUp", e)
    }
    const onDoubleClick = (e: MouseEvent): void => {
      const store = useAppStore.getState()
      const raw = clientToScene(
        canvas,
        { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        e,
      )
      const at = snapScenePoint(raw, resolveGrid(), e)
      dispatch({ type: "doubleClick", at }, modifiersOf(e))
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    useAppStore
      .getState()
      .setDispatchToolEvent((e) =>
        dispatch(e, { shift: false, alt: false, ctrl: false, meta: false }),
      )

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      useAppStore.getState().setDispatchToolEvent(null)
      unsubStore()
      renderer.stop()
      rendererRef.current = null
      onTeardown?.()
    }
  }, [scene, canvasRef, overlayRef, onReady, onTeardown])
}
