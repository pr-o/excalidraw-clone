"use client"
import { useEffect } from "react"
import { useAppStore } from "../store"

const MARGIN = 12

/** Screen px the canvas must scroll up so a field ending at `fieldBottom` clears
 *  the visible area's bottom edge (0 when it already does). */
export function keyboardPanDelta(fieldBottom: number, visibleBottom: number): number {
  return Math.max(0, fieldBottom - (visibleBottom - MARGIN))
}

/** Is this focused element an input that lives on the canvas (text editor,
 *  table cell, comment composer), i.e. one that moves when the view scrolls? */
const isCanvasField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  (el.hasAttribute("data-canvas-text") || el.getAttribute("data-testid") === "comment-input")

/** When the on-screen keyboard shrinks the visual viewport, scroll the canvas
 *  view so the field being typed into (text editor, comment) stays visible. */
export function useKeyboardAvoidance(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const reveal = (): void => {
      const field = document.activeElement
      if (!isCanvasField(field)) return
      const dy = keyboardPanDelta(field.getBoundingClientRect().bottom, vv.offsetTop + vv.height)
      if (dy === 0) return
      const s = useAppStore.getState()
      s.setView({ scrollX: s.scrollX, scrollY: s.scrollY - dy / s.zoom, zoom: s.zoom })
    }
    vv.addEventListener("resize", reveal)
    vv.addEventListener("scroll", reveal)
    return () => {
      vv.removeEventListener("resize", reveal)
      vv.removeEventListener("scroll", reveal)
    }
  }, [])
}
