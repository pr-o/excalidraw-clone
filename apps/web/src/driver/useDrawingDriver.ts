"use client"
import { sceneToViewport } from "@excalidraw-clone/geometry"
import { putFile } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  hitTestElement,
  type ExcalidrawElement,
  type LibraryItem,
  type Scene,
} from "@excalidraw-clone/scene"
import {
  TOOLS,
  type ImageReadyEvent,
  type Modifiers,
  type Tool,
  type ToolContext,
  type ToolEvent,
} from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { applyEffects } from "./effects"
import { clientToScene, modifiersOf, pointerEventToToolEvent } from "./events"

const GHOST_STROKE = "#6b46c1"

function placeLibraryItem(item: LibraryItem, x: number, y: number, scene: Scene): void {
  if (item.files) {
    for (const bin of Object.values(item.files)) {
      void putFile(bin)
    }
  }
  const placed: ExcalidrawElement[] = item.elements.map((el) => ({
    ...el,
    id: crypto.randomUUID(),
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

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const renderer = new CanvasRenderer(canvas, scene, { overlayCanvas: overlay })
    rendererRef.current = renderer
    renderer.start()
    onReady?.(renderer)

    const unsubStore = useAppStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) renderer.setTheme(s.theme === "dark" ? "dark" : "light")
      if (s.scrollX !== prev.scrollX || s.scrollY !== prev.scrollY || s.zoom !== prev.zoom) {
        renderer.setViewTransform({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom })
      }
      if (s.gridEnabled !== prev.gridEnabled || s.gridSize !== prev.gridSize) {
        renderer.setGrid({ enabled: s.gridEnabled, size: s.gridSize })
      }
      if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)
    })

    const dispatch = (event: ToolEvent | ImageReadyEvent, modifiers: Modifiers): void => {
      const store = useAppStore.getState()
      const toolName = store.activeTool
      const tool: Tool<unknown, ToolEvent | ImageReadyEvent> = TOOLS[toolName]
      const currentState = store.toolStates[toolName] ?? tool.initial
      const ctx: ToolContext = {
        readElements: () => scene.getElements(),
        hitTest: (at) => {
          const elements = scene.getElements()
          for (let i = elements.length - 1; i >= 0; i -= 1) {
            const el = elements[i] as ExcalidrawElement
            if (hitTestElement(el, at)) return el
          }
          return null
        },
        viewTransform: { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        modifiers,
        selectedIds: store.selectedIds,
      }
      const [next, effects] = tool.reduce(currentState, event, ctx)
      useAppStore.getState().setToolState(toolName, next)
      applyEffects(scene, effects)
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
        e,
      )
      dispatch(event, modifiersOf(e))
    }

    const onPointerDown = (e: PointerEvent): void => {
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        const at = clientToScene(
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e,
        )
        placeLibraryItem(pending, at.x, at.y, scene)
        store.clearPendingItem()
        overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
        return
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => {
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        const at = clientToScene(
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e,
        )
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
      if (useAppStore.getState().pendingItem) return
      canvas.releasePointerCapture(e.pointerId)
      dispatchPointer("pointerUp", e)
    }
    const onDoubleClick = (e: MouseEvent): void => {
      const store = useAppStore.getState()
      const at = clientToScene(
        canvas,
        { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        e,
      )
      dispatch({ type: "doubleClick", at }, modifiersOf(e))
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)

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
      useAppStore.getState().setDispatchToolEvent(null)
      unsubStore()
      renderer.stop()
      rendererRef.current = null
      onTeardown?.()
    }
  }, [scene, canvasRef, overlayRef, onReady, onTeardown])
}
