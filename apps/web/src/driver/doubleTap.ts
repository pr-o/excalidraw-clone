/** Two touch taps closer than this in time (ms) and space (px) are a double-tap. */
export const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 24
/** A press that drifts or lingers past these is not a tap. */
const TAP_MOVE_SLOP = 10
const TAP_MAX_MS = 300

type Stamp = { x: number; y: number; t: number }
type TouchLike = { pointerId: number; clientX: number; clientY: number; timeStamp: number }

/** Touch double-tap detector: iOS Safari sends no `dblclick` for a canvas
 *  with `touch-action: none`, so double-tap (label/text editing) is derived
 *  from the pointer stream. `up` returns true on the second tap. */
export function createDoubleTap(): {
  down: (e: TouchLike) => void
  up: (e: TouchLike) => boolean
} {
  let press: (Stamp & { id: number }) | null = null
  let lastTap: Stamp | null = null
  return {
    down: (e) => {
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
    },
    up: (e) => {
      const p = press
      press = null
      if (!p || p.id !== e.pointerId) return false
      const isTap =
        e.timeStamp - p.t <= TAP_MAX_MS &&
        Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_MOVE_SLOP
      if (!isTap) {
        lastTap = null
        return false
      }
      const prev = lastTap
      if (
        prev &&
        e.timeStamp - prev.t <= DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_SLOP
      ) {
        lastTap = null
        return true
      }
      lastTap = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      return false
    },
  }
}
