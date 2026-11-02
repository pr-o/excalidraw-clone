import type { Point } from "@excalidraw-clone/geometry"
import {
  addBackRef,
  BINDING_GAP,
  bindingTargetAt,
  computeFocus,
  removeBackRef,
  type ExcalidrawArrowElement,
  type ExcalidrawElement,
  type PointBinding,
} from "@excalidraw-clone/scene"
import { updateElement } from "../../draft"
import type { ToolEffect, ToolContext, ToolEvent } from "../../types"
import { linearPatch } from "../linear"
import type { SelectionState, Transition } from "./types"

export interface LinearSnapshot {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
  startBinding: PointBinding | null
  endBinding: PointBinding | null
}

export const snapshotLinear = (e: ExcalidrawElement): LinearSnapshot => {
  const a = e as ExcalidrawArrowElement
  return {
    x: a.x,
    y: a.y,
    width: a.width,
    height: a.height,
    points: a.points,
    startBinding: a.startBinding ?? null,
    endBinding: a.endBinding ?? null,
  }
}

const endpointAbs = (a: ExcalidrawArrowElement, end: "start" | "end"): Point => {
  const idx = end === "start" ? 0 : a.points.length - 1
  const p = a.points[idx]!
  return { x: a.x + p.x, y: a.y + p.y }
}

const bindingKey = (end: "start" | "end"): "startBinding" | "endBinding" =>
  end === "start" ? "startBinding" : "endBinding"

export const buildEndpointMoveEffect = (
  elementId: string,
  end: "start" | "end",
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
      return { ...a, ...linearPatch(startAbs, endAbs), [bindingKey(end)]: null }
    }),
})

export const buildEndpointCommitEffect = (elementId: string, end: "start" | "end"): ToolEffect => ({
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
