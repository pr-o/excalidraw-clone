import { type Point, boundsFromPoints } from "@excalidraw-clone/geometry"
import { newFreedraw } from "@excalidraw-clone/scene"
import {
  addDraftEffect,
  discardDraftEffect,
  patchDraftEffect,
  patchElement,
  selectAndSwitchEffects,
} from "../draft"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type FreedrawState =
  | { phase: "idle" }
  | { phase: "drawing"; elementId: string; points: readonly Point[] }

const FREEDRAW_INITIAL: FreedrawState = { phase: "idle" }

interface FreedrawPatch {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
}

const freedrawPatch = (origin: Point, points: readonly Point[]): FreedrawPatch => {
  if (points.length === 0) {
    return { x: origin.x, y: origin.y, width: 0, height: 0, points: [] }
  }
  const bounds = boundsFromPoints(points)
  const relative = points.map((p) => ({ x: p.x - bounds.x, y: p.y - bounds.y }))
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points: relative,
  }
}

export const freedrawTool: Tool<FreedrawState, ToolEvent> = {
  name: "freedraw",
  initial: FREEDRAW_INITIAL,
  reduce(state, event, _ctx: ToolContext): [FreedrawState, readonly ToolEffect[]] {
    void _ctx
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const element = newFreedraw({ x: event.at.x, y: event.at.y })
        const next: FreedrawState = {
          phase: "drawing",
          elementId: element.id,
          points: [event.at],
        }
        return [next, [addDraftEffect(element)]]
      }
      return [state, []]
    }
    switch (event.type) {
      case "pointerMove": {
        const points = [...state.points, event.at]
        const id = state.elementId
        const patch = freedrawPatch(points[0]!, points)
        return [{ phase: "drawing", elementId: id, points }, [patchDraftEffect(id, patch)]]
      }
      case "pointerUp": {
        const id = state.elementId
        const next: FreedrawState = { phase: "idle" }
        if (state.points.length < 2) {
          return [next, [discardDraftEffect(id)]]
        }
        const patch = freedrawPatch(state.points[0]!, state.points)
        return [
          next,
          [
            {
              kind: "mutation",
              apply: (draft) => patchElement(draft, id, patch),
            },
            ...selectAndSwitchEffects(id),
          ],
        ]
      }
      case "escape": {
        const id = state.elementId
        return [{ phase: "idle" }, [discardDraftEffect(id)]]
      }
      default:
        return [state, []]
    }
  },
}
