import type { Point } from "@excalidraw-clone/geometry"
import { newFreedraw, pointsPatch } from "@excalidraw-clone/scene"
import { addDraftEffect, commitDraftEffects, discardDraftEffect, patchDraftEffect } from "../draft"
import type { Tool, ToolEffect, ToolEvent } from "../types"

export type FreedrawState =
  { phase: "idle" } | { phase: "drawing"; elementId: string; points: readonly Point[] }

export const freedrawTool: Tool<FreedrawState, ToolEvent> = {
  name: "freedraw",
  initial: { phase: "idle" },
  reduce(state, event): [FreedrawState, readonly ToolEffect[]] {
    if (state.phase === "idle") {
      if (event.type !== "pointerDown") return [state, []]
      const element = newFreedraw({ x: event.at.x, y: event.at.y })
      return [
        { phase: "drawing", elementId: element.id, points: [event.at] },
        [addDraftEffect(element)],
      ]
    }
    const id = state.elementId
    switch (event.type) {
      case "pointerMove": {
        const points = [...state.points, event.at]
        return [{ ...state, points }, [patchDraftEffect(id, pointsPatch(points))]]
      }
      case "pointerUp":
        // A single point is a click, not a stroke.
        return [
          { phase: "idle" },
          state.points.length < 2
            ? [discardDraftEffect(id)]
            : commitDraftEffects(id, pointsPatch(state.points)),
        ]
      case "escape":
        return [{ phase: "idle" }, [discardDraftEffect(id)]]
      default:
        return [state, []]
    }
  },
}
