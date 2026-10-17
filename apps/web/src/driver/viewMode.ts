"use client"
import { useAppStore } from "../store"

/** Single read-only predicate: presentation and view mode both forbid scene edits. */
export const isReadOnly = (s: { presenting: boolean; viewMode: boolean }): boolean =>
  s.presenting || s.viewMode

/** Flips view mode. Entering is ignored while presenting; it cancels any
 *  in-flight gesture and closes editors/dialogs so nothing is left half-done. */
export function toggleViewMode(): void {
  const s = useAppStore.getState()
  if (s.viewMode) {
    s.setViewMode(false)
    return
  }
  if (s.presenting) return
  // Blur first so an open text editor commits through its normal blur path.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  s.dispatchToolEvent?.({ type: "escape" })
  s.setSelection([])
  s.setActiveTool("selection")
  s.clearPendingItem()
  s.setOpenDialog(null)
  s.setPaletteOpen(false)
  s.setContextMenu(null)
  s.setTextEditElementId(null)
  s.setLinkEditorElementId(null)
  s.setCropElementId(null)
  s.setViewMode(true)
}
