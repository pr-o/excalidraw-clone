import { type Point, polygonIntersectsBounds } from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  expandIdsToGroups,
  getElementBounds,
} from "@excalidraw-clone/scene"
import type { Tool, ToolEffect, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

export type LassoState = { phase: "idle" } | { phase: "drawing"; points: readonly Point[] }

const LASSO_INITIAL: LassoState = { phase: "idle" }

/** Ids of live, unlocked elements whose bounds overlap the closed `path`. */
const elementsTouchingLasso = (
  path: readonly Point[],
  elements: readonly ExcalidrawElement[],
): string[] =>
  elements
    .filter((e) => !e.isDeleted && !e.locked && polygonIntersectsBounds(path, getElementBounds(e)))
    .map((e) => e.id)

const finish = (effects: readonly ToolEffect[]): [LassoState, readonly ToolEffect[]] => [
  LASSO_INITIAL,
  [...effects, { kind: "switchTool", tool: "selection" }],
]

export const lassoTool: Tool<LassoState, ToolEvent> = {
  name: "lasso",
  initial: LASSO_INITIAL,
  reduce(state, event, ctx) {
    if (state.phase === "idle") {
      return event.type === "pointerDown"
        ? [{ phase: "drawing", points: [event.at] }, NO_EFFECTS]
        : [state, NO_EFFECTS]
    }
    switch (event.type) {
      case "pointerMove":
        return [{ phase: "drawing", points: [...state.points, event.at] }, NO_EFFECTS]
      case "pointerUp": {
        const elements = ctx.readElements()
        const enclosed = expandIdsToGroups(elementsTouchingLasso(state.points, elements), elements)
        const ids = ctx.modifiers.shift ? [...new Set([...ctx.selectedIds, ...enclosed])] : enclosed
        return finish([{ kind: "select", ids }])
      }
      case "escape":
        return finish([])
      default:
        return [state, NO_EFFECTS]
    }
  },
}
