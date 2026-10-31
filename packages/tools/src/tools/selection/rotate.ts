import type { Point } from "@excalidraw-clone/geometry"
import { patchElement } from "../../draft"
import type { Modifiers, ToolEffect, ToolContext, ToolEvent } from "../../types"
import { buildRecommitEffect } from "./recommit"
import type { SelectionState, Transition } from "./types"

const SNAP_STEP = (15 * Math.PI) / 180

export const pointerAngle = (center: Point, at: Point): number =>
  Math.atan2(at.y - center.y, at.x - center.x)

export const computeRotation = (
  origin: { angle: number },
  pointerAngleAtStart: number,
  current: number,
  modifiers: Modifiers,
): number => {
  const raw = origin.angle + (current - pointerAngleAtStart)
  if (!modifiers.shift) return raw
  return Math.round(raw / SNAP_STEP) * SNAP_STEP
}

export const buildRotateMoveEffect = (elementId: string, angle: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => patchElement(draft, elementId, { angle }),
  skipHistory: true,
})

export const buildRotateCommitEffect = (elementId: string): ToolEffect =>
  buildRecommitEffect([elementId])

export const buildRotateRevertEffect = (elementId: string, originalAngle: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => patchElement(draft, elementId, { angle: originalAngle }),
  skipHistory: true,
})

export const reduceRotating = (
  state: Extract<SelectionState, { phase: "rotating" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      const current = pointerAngle(state.center, event.at)
      const newAngle = computeRotation(
        state.origin,
        state.pointerAngleAtStart,
        current,
        ctx.modifiers,
      )
      return [state, [buildRotateMoveEffect(state.elementId, newAngle)]]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildRotateCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildRotateRevertEffect(state.elementId, state.origin.angle)]]
    default:
      return [state, []]
  }
}
