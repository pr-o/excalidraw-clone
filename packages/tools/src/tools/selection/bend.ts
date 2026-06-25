import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"
import { pointsPatch } from "../linear"
import type { LinearSnapshot } from "./endpoint"

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
