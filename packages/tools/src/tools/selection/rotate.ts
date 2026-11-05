import type { Point } from "@excalidraw-clone/geometry"
import { patchDraftEffect } from "../../draft"
import type { Modifiers, ToolContext, ToolEvent } from "../../types"
import { buildRecommitEffect } from "./recommit"
import type { SelectionState, Transition } from "./types"

/** Shift snaps rotation to 15° steps. */
const SNAP_STEP = (15 * Math.PI) / 180

export const pointerAngle = (center: Point, at: Point): number =>
  Math.atan2(at.y - center.y, at.x - center.x)

const computeRotation = (
  origin: { angle: number },
  pointerAngleAtStart: number,
  current: number,
  modifiers: Modifiers,
): number => {
  const raw = origin.angle + (current - pointerAngleAtStart)
  return modifiers.shift ? Math.round(raw / SNAP_STEP) * SNAP_STEP : raw
}

export const reduceRotating = (
  state: Extract<SelectionState, { phase: "rotating" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      const current = pointerAngle(state.center, event.at)
      const angle = computeRotation(state.origin, state.pointerAngleAtStart, current, ctx.modifiers)
      return [state, [patchDraftEffect(state.elementId, { angle })]]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildRecommitEffect([state.elementId])]]
    case "escape":
      return [{ phase: "idle" }, [patchDraftEffect(state.elementId, { angle: state.origin.angle })]]
    default:
      return [state, []]
  }
}
