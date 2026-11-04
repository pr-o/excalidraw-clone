import { hitTestUserGuide } from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"
import { findHandleAt } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { clientToScene } from "./events"
import { applyGuideDrag, guideValueAt, type GuideDrag } from "./userGuides"
import { isReadOnly } from "./viewMode"

/**
 * Ruler guides on the canvas: only the exact line (4px) captures the pointer, only with
 * the selection tool and rulers shown, so elements beneath stay selectable everywhere
 * else. Also owns the resize cursors shown over a guide or a selected table's border.
 */
export function createGuideGesture(canvas: HTMLCanvasElement, scene: Scene) {
  let drag: GuideDrag | null = null
  let cursorActive = false

  const hitAt = (e: MouseEvent): { axis: "x" | "y"; index: number } | null => {
    const store = useAppStore.getState()
    if (!store.rulersVisible || isReadOnly(store) || store.activeTool !== "selection") return null
    return hitTestUserGuide(scene.getGuides(), clientToScene(canvas, viewOf(store), e), store.zoom)
  }

  return {
    /** Grabs the guide under the pointer, if any. */
    start(e: PointerEvent): boolean {
      const hit = hitAt(e)
      if (!hit) return false
      canvas.setPointerCapture(e.pointerId)
      drag = hit
      return true
    },

    /** Drags the grabbed guide; true while a guide drag is in progress. */
    move(e: PointerEvent): boolean {
      if (!drag) return false
      const r = canvas.getBoundingClientRect()
      const value = guideValueAt(
        drag.axis,
        { x: e.clientX - r.left, y: e.clientY - r.top },
        viewOf(useAppStore.getState()),
      )
      drag = applyGuideDrag(scene, drag, value)
      return true
    },

    end(e: PointerEvent): boolean {
      if (!drag) return false
      drag = null
      canvas.releasePointerCapture(e.pointerId)
      return true
    },

    /** Deletes the guide under a double-click; true when there was one. */
    removeAt(e: MouseEvent): boolean {
      const hit = hitAt(e)
      if (!hit) return false
      applyGuideDrag(scene, hit, null)
      return true
    },

    /** Resize cursor over a guide line or a selected table's column/row border. */
    updateHoverCursor(e: PointerEvent): void {
      const guide = hitAt(e)
      const s = useAppStore.getState()
      const border =
        !guide && s.activeTool === "selection" && s.selectedIds.length === 1
          ? findHandleAt(
              clientToScene(canvas, viewOf(s), e),
              s.selectedIds,
              scene.getElements(),
              viewOf(s),
            )
          : null
      const axis = guide ? guide.axis : border?.kind === "tableBorder" ? border.axis : null
      if (axis === null && !cursorActive) return
      canvas.style.cursor =
        axis === null ? "" : axis === "x" || axis === "col" ? "col-resize" : "row-resize"
      cursorActive = axis !== null
    },
  }
}

export type GuideGesture = ReturnType<typeof createGuideGesture>
