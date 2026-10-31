import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawArrowElement, pointsPatch } from "@excalidraw-clone/scene"
import type { ToolEffect, ToolEvent } from "../../types"
import type { LinearSnapshot } from "./endpoint"
import type { SelectionState, Transition } from "./types"

const absPoints = (a: ExcalidrawArrowElement): Point[] =>
  a.points.map((p) => ({ x: a.x + p.x, y: a.y + p.y }))

export const buildBendInsertEffect = (
  elementId: string,
  insertIndex: number,
  at: Point,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    const abs = absPoints(a)
    abs.splice(insertIndex, 0, at)
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendMoveEffect = (elementId: string, index: number, to: Point): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (index < 0 || index >= a.points.length) return
    const abs = absPoints(a)
    abs[index] = to
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendCommitEffect = (elementId: string): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    draft[i] = { ...a, ...pointsPatch(absPoints(a)) }
  },
})

export const buildBendRemoveEffect = (elementId: string, index: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (a.points.length <= 2) return
    if (index <= 0 || index >= a.points.length - 1) return // interior only
    const abs = absPoints(a)
    abs.splice(index, 1)
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendRevertEffect = (elementId: string, origin: LinearSnapshot): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...(draft[i] as ExcalidrawArrowElement), ...origin }
  },
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
