import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawArrowElement, pointsPatch } from "@excalidraw-clone/scene"
import { updateElement } from "../../draft"
import type { ToolEffect, ToolEvent } from "../../types"
import type { LinearSnapshot } from "./endpoint"
import type { SelectionState, Transition } from "./types"

const absPoints = (a: ExcalidrawArrowElement): Point[] =>
  a.points.map((p) => ({ x: a.x + p.x, y: a.y + p.y }))

/** A bend edit: `edit` receives the arrow's absolute points and mutates them in place. */
const editPoints = (
  elementId: string,
  edit: (abs: Point[], a: ExcalidrawArrowElement) => boolean | void,
  skipHistory: boolean,
): ToolEffect => ({
  kind: "mutation",
  ...(skipHistory ? { skipHistory: true } : {}),
  apply: (draft) =>
    updateElement<ExcalidrawArrowElement>(draft, elementId, (a) => {
      const abs = absPoints(a)
      if (edit(abs, a) === false) return undefined
      return { ...a, ...pointsPatch(abs) }
    }),
})

export const buildBendInsertEffect = (
  elementId: string,
  insertIndex: number,
  at: Point,
): ToolEffect =>
  editPoints(
    elementId,
    (abs) => {
      abs.splice(insertIndex, 0, at)
    },
    true,
  )

export const buildBendMoveEffect = (elementId: string, index: number, to: Point): ToolEffect =>
  editPoints(
    elementId,
    (abs, a) => {
      if (index < 0 || index >= a.points.length) return false
      abs[index] = to
    },
    true,
  )

/** Re-anchors the arrow to the bounds of its (already moved) points. */
export const buildBendCommitEffect = (elementId: string): ToolEffect =>
  editPoints(elementId, () => undefined, false)

export const buildBendRemoveEffect = (elementId: string, index: number): ToolEffect =>
  editPoints(
    elementId,
    (abs, a) => {
      if (a.points.length <= 2) return false
      if (index <= 0 || index >= a.points.length - 1) return false // interior only
      abs.splice(index, 1)
    },
    false,
  )

export const buildBendRevertEffect = (elementId: string, origin: LinearSnapshot): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) =>
    updateElement<ExcalidrawArrowElement>(draft, elementId, (a) => ({ ...a, ...origin })),
})

export const reduceBend = (
  state: Extract<SelectionState, { phase: "bendDragging" }>,
  event: ToolEvent,
): Transition => {
  switch (event.type) {
    case "pointerMove":
      return [state, [buildBendMoveEffect(state.elementId, state.index, event.at)]]
    case "pointerUp":
      return [{ phase: "idle" }, [buildBendCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildBendRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
