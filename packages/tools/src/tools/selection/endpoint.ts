import type { Point } from "@excalidraw-clone/geometry"
import { BINDING_GAP, bindingTargetAt, computeFocus } from "@excalidraw-clone/scene"
import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  PointBinding,
} from "@excalidraw-clone/scene"
import { addBackRef, removeBackRef } from "../../binding-refs"
import type { ToolEffect } from "../../types"
import { linearPatch } from "../linear"

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
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    const startAbs = end === "start" ? to : endpointAbs(a, "start")
    const endAbs = end === "end" ? to : endpointAbs(a, "end")
    const dragged = a[bindingKey(end)]
    if (dragged) removeBackRef(draft, dragged.elementId, a.id)
    draft[i] = { ...a, ...linearPatch(startAbs, endAbs), [bindingKey(end)]: null }
  },
})

export const buildEndpointCommitEffect = (elementId: string, end: "start" | "end"): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (a.type !== "arrow") return
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
    draft[i] = { ...a, [bindingKey(end)]: binding }
  },
})

export const buildEndpointRevertEffect = (
  elementId: string,
  origin: LinearSnapshot,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...(draft[i] as ExcalidrawArrowElement), ...origin }
    if (origin.startBinding) addBackRef(draft, origin.startBinding.elementId, elementId)
    if (origin.endBinding) addBackRef(draft, origin.endBinding.elementId, elementId)
  },
})
