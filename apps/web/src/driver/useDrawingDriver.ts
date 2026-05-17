"use client"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import { hitTestElement, type ExcalidrawElement, type Scene } from "@excalidraw-clone/scene"
import {
  TOOLS,
  type Modifiers,
  type Tool,
  type ToolContext,
  type ToolEvent,
} from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { applyEffects } from "./effects"
import { clientToScene, modifiersOf, pointerEventToToolEvent } from "./events"

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
}

export function useDrawingDriver({ scene, canvasRef, overlayRef }: DriverOptions): void {
  const rendererRef = useRef<CanvasRenderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const renderer = new CanvasRenderer(canvas, scene, { overlayCanvas: overlay })
    rendererRef.current = renderer
    renderer.start()

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

    const dispatch = (event: ToolEvent, modifiers: Modifiers): void => {
      const store = useAppStore.getState()
      const toolName = store.activeTool
      const tool: Tool<unknown, ToolEvent> = TOOLS[toolName]
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
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => dispatchPointer("pointerMove", e)
    const onPointerUp = (e: PointerEvent): void => {
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

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      unsubStore()
      renderer.stop()
      rendererRef.current = null
    }
  }, [scene, canvasRef, overlayRef])
}
