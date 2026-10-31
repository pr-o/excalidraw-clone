"use client"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { EraserState } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import type { LaserTrail } from "./laserTrail"
import { NO_MODIFIERS, type ToolDispatch } from "./toolDispatch"
import { isReadOnly } from "./viewMode"

/** Mirrors store changes onto the renderer and enforces the store-driven
 *  invariants that depend on them (crop mode exit, cancelling a tool's
 *  in-flight gesture when switching away). Returns the unsubscribe. */
export function syncRendererWithStore(
  renderer: CanvasRenderer,
  laser: LaserTrail,
  dispatch: ToolDispatch,
): () => void {
  return useAppStore.subscribe((s, prev) => {
    if (s.resolvedTheme !== prev.resolvedTheme) renderer.setTheme(s.resolvedTheme)
    if (s.canvasBg !== prev.canvasBg) renderer.setCanvasBg(s.canvasBg)
    if (s.scrollX !== prev.scrollX || s.scrollY !== prev.scrollY || s.zoom !== prev.zoom) {
      renderer.setViewTransform(viewOf(s))
    }
    if (s.gridEnabled !== prev.gridEnabled || s.gridSize !== prev.gridSize) {
      renderer.setGrid({ enabled: s.gridEnabled, size: s.gridSize })
    }
    if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)
    if (s.textEditElementId !== prev.textEditElementId || s.textEditCell !== prev.textEditCell) {
      // A table stays drawn while one of its cells is edited; only that cell's text hides.
      renderer.setHiddenElement(s.textEditElementId, s.textEditCell)
    }
    if (s.cropElementId !== prev.cropElementId) renderer.setCropElement(s.cropElementId)
    // Crop mode lasts only while that one image stays the sole selection on the
    // selection tool; page switches, tool switches and clicking away all break it.
    if (
      s.cropElementId !== null &&
      (s.activeTool !== "selection" ||
        s.selectedIds.length !== 1 ||
        s.selectedIds[0] !== s.cropElementId)
    ) {
      s.setCropElementId(null)
      s.resetToolState("selection")
    }
    if (s.activeGuides !== prev.activeGuides) renderer.setGuides(s.activeGuides)
    if (
      s.rulersVisible !== prev.rulersVisible ||
      s.presenting !== prev.presenting ||
      s.viewMode !== prev.viewMode
    ) {
      renderer.setShowUserGuides(s.rulersVisible && !isReadOnly(s))
    }
    if (s.activeTool !== prev.activeTool && prev.activeTool === "laser") laser.clear()
    if (
      s.activeTool !== prev.activeTool &&
      (prev.activeTool === "lasso" || prev.activeTool === "eraser")
    ) {
      renderer.setLasso([])
    }
    // Switching away mid-drag cancels the erase like Escape (restores live erasures, no history).
    if (s.activeTool !== prev.activeTool && prev.activeTool === "eraser") {
      if ((s.toolStates.eraser as EraserState | undefined)?.phase === "erasing") {
        dispatch({ type: "escape" }, NO_MODIFIERS, "eraser")
      }
      useAppStore.getState().resetToolState("eraser")
    }
  })
}
