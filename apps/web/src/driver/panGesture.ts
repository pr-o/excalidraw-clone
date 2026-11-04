import { useAppStore } from "../store"

interface PanDrag {
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollX: number
  startScrollY: number
}

/** Pan state that must outlive the driver effect (it re-runs on every page switch while Space may stay held). */
export interface PanState {
  spaceHeld: boolean
  drag: PanDrag | null
  /** When Space is released mid-pan while the pointer is still down, the tool never
   *  received a matching pointerDown for this gesture. Marking the pointer as
   *  orphaned suppresses its remaining move/up events until it lifts, preventing a
   *  phantom (move + up without down) dispatch into the active tool. */
  orphanedPointerId: number | null
}

export const createPanState = (): PanState => ({
  spaceHeld: false,
  drag: null,
  orphanedPointerId: null,
})

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
}

/** Space-drag and view-mode hand-tool panning of the canvas. */
export function createPanGesture(canvas: HTMLCanvasElement, state: PanState) {
  const releaseSpace = (): void => {
    state.spaceHeld = false
    const drag = state.drag
    if (drag) {
      // Pointer is still down mid-pan: orphan it so the rest of this gesture
      // never leaks into the tool as a down-less move/up pair.
      state.orphanedPointerId = drag.pointerId
      canvas.releasePointerCapture(drag.pointerId)
    }
    state.drag = null
    canvas.style.cursor = ""
  }

  return {
    get spaceHeld(): boolean {
      return state.spaceHeld
    },

    onKeyDown(e: KeyboardEvent): void {
      if (
        e.code !== "Space" ||
        isTypingTarget(e.target) ||
        state.spaceHeld ||
        // No Space-drag panning while presenting: the viewport is read-only.
        useAppStore.getState().presenting
      ) {
        return
      }
      state.spaceHeld = true
      if (!state.drag) canvas.style.cursor = "grab"
    },

    onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") releaseSpace()
    },

    /** The keyup never arrives if the window loses focus while Space is held
     *  (Alt-Tab, a dialog stealing focus), which would leave pan mode stuck on. */
    onWindowBlur(): void {
      if (state.spaceHeld || state.drag) releaseSpace()
    },

    /** A fresh, real pointerDown for this id proves any lingering orphaned state is
     *  stale (e.g. the orphaned gesture's pointerUp landed on a UI sibling after
     *  capture was released, so our up handler never fired). */
    clearOrphan(e: PointerEvent): void {
      if (state.orphanedPointerId === e.pointerId) state.orphanedPointerId = null
    },

    isOrphan(e: PointerEvent): boolean {
      return state.orphanedPointerId === e.pointerId
    },

    /** Starts a pan when Space is held, or in view mode (left-drag pans, hand-tool style,
     *  except for the laser). Returns whether this press became a pan. */
    start(e: PointerEvent): boolean {
      const s = useAppStore.getState()
      // `spaceHeld` can still be set from a Space held down before presentation started.
      const wanted = state.spaceHeld || (s.viewMode && s.activeTool !== "laser")
      if (!wanted || s.presenting) return false
      canvas.setPointerCapture(e.pointerId)
      state.drag = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollX: s.scrollX,
        startScrollY: s.scrollY,
      }
      canvas.style.cursor = "grabbing"
      return true
    },

    /** Moves the view while panning; true when the move was part of a pan. */
    move(e: PointerEvent): boolean {
      const drag = state.drag
      if (!drag) return false
      const s = useAppStore.getState()
      s.setView({
        scrollX: drag.startScrollX + (e.clientX - drag.startClientX) / s.zoom,
        scrollY: drag.startScrollY + (e.clientY - drag.startClientY) / s.zoom,
        zoom: s.zoom,
      })
      return true
    },

    /** Ends an orphaned gesture or a pan; true when the release belonged to one. */
    end(e: PointerEvent): boolean {
      if (state.orphanedPointerId === e.pointerId) {
        // Clear the mark so a fresh press works normally, and swallow this up so no
        // down-less pointerUp is dispatched.
        state.orphanedPointerId = null
        canvas.releasePointerCapture(e.pointerId)
        return true
      }
      if (state.drag) {
        state.drag = null
        canvas.releasePointerCapture(e.pointerId)
        canvas.style.cursor = state.spaceHeld ? "grab" : ""
        return true
      }
      return false
    },
  }
}

export type PanGesture = ReturnType<typeof createPanGesture>
