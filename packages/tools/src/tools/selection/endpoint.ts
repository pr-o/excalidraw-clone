import {
  updateElement,
  addBackRef,
  BINDING_GAP,
  bindingTargetAt,
  computeFocus,
  pointsPatch,
  removeBackRef,
  type ExcalidrawArrowElement,
  type ExcalidrawLinearElement,
  type PointBinding,
} from "@excalidraw-clone/scene"
import { pointAdd, type Point } from "@excalidraw-clone/geometry"
import type { ToolEffect, ToolContext, ToolEvent } from "../../types"
import type { LinearEnd, SelectionState, Transition } from "./types"

export interface LinearSnapshot {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
  startBinding: PointBinding | null
  endBinding: PointBinding | null
}

/** What an endpoint or bend drag changes, kept so Escape can put it back. */
export const snapshotLinear = (e: ExcalidrawLinearElement): LinearSnapshot => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
  points: e.points,
  // Older files may omit the fields entirely.
  startBinding: e.startBinding ?? null,
  endBinding: e.endBinding ?? null,
})

const endpointAbs = (a: ExcalidrawArrowElement, end: LinearEnd): Point =>
  pointAdd(a, a.points[end === "start" ? 0 : a.points.length - 1]!)

const bindingKey = (end: LinearEnd): "startBinding" | "endBinding" =>
  end === "start" ? "startBinding" : "endBinding"

export const buildEndpointMoveEffect = (
  elementId: string,
  end: LinearEnd,
  to: Point,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) =>
    updateElement<ExcalidrawArrowElement>(draft, elementId, (a) => {
      const startAbs = end === "start" ? to : endpointAbs(a, "start")
      const endAbs = end === "end" ? to : endpointAbs(a, "end")
      const dragged = a[bindingKey(end)]
      if (dragged) removeBackRef(draft, dragged.elementId, a.id)
      return { ...a, ...pointsPatch([startAbs, endAbs]), [bindingKey(end)]: null }
    }),
})

export const buildEndpointCommitEffect = (elementId: string, end: LinearEnd): ToolEffect => ({
  kind: "mutation",
  apply: (draft) =>
    updateElement<ExcalidrawArrowElement>(draft, elementId, (a) => {
      if (a.type !== "arrow") return undefined
      const endpoint = endpointAbs(a, end)
      const toward = endpointAbs(a, end === "start" ? "end" : "start")
      const target = bindingTargetAt(endpoint, draft)
      const old = a[bindingKey(end)]
      if (old && old.elementId !== target?.id) removeBackRef(draft, old.elementId, a.id)
      let binding: PointBinding | null = null
      if (target) {
        binding = {
          elementId: target.id,
          focus: computeFocus(target, endpoint, toward),
          gap: BINDING_GAP,
        }
        addBackRef(draft, target.id, a.id)
      }
      return { ...a, [bindingKey(end)]: binding }
    }),
})

export const buildEndpointRevertEffect = (
  elementId: string,
  origin: LinearSnapshot,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    updateElement<ExcalidrawArrowElement>(draft, elementId, (a) => ({ ...a, ...origin }))
    if (origin.startBinding) addBackRef(draft, origin.startBinding.elementId, elementId)
    if (origin.endBinding) addBackRef(draft, origin.endBinding.elementId, elementId)
  },
})

export const reduceEndpoint = (
  state: Extract<SelectionState, { phase: "endpointDragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      const candidate = bindingTargetAt(event.at, ctx.readElements())
      return [
        { ...state, candidateBindId: candidate?.id ?? null },
        [buildEndpointMoveEffect(state.elementId, state.end, event.at)],
      ]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildEndpointCommitEffect(state.elementId, state.end)]]
    case "escape":
      return [{ phase: "idle" }, [buildEndpointRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
