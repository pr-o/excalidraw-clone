import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../../types"

const SNAP_STEP = (15 * Math.PI) / 180

export const elementCenter = (e: ExcalidrawElement): Point => ({
  x: e.x + e.width / 2,
  y: e.y + e.height / 2,
})

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
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...draft[i]!, angle }
  },
  skipHistory: true,
})

export const buildRotateCommitEffect = (elementId: string): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...draft[i]! }
  },
})

export const buildRotateRevertEffect = (elementId: string, originalAngle: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...draft[i]!, angle: originalAngle }
  },
  skipHistory: true,
})
