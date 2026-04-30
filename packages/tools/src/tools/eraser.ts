import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type EraserState = { phase: "idle" } | { phase: "erasing"; erasedIds: readonly string[] }

const ERASER_INITIAL: EraserState = { phase: "idle" }

const setDeletedFlag = (draft: ExcalidrawElement[], id: string, isDeleted: boolean): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const prev = draft[i]!
  draft[i] = { ...prev, isDeleted }
}

export const eraserTool: Tool<EraserState, ToolEvent> = {
  name: "eraser",
  initial: ERASER_INITIAL,
  reduce(state, event, ctx: ToolContext): [EraserState, readonly ToolEffect[]] {
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const hit = ctx.hitTest(event.at)
        if (!hit) {
          return [{ phase: "erasing", erasedIds: [] }, []]
        }
        return [
          { phase: "erasing", erasedIds: [hit.id] },
          [
            {
              kind: "mutation",
              apply: (draft) => setDeletedFlag(draft, hit.id, true),
              skipHistory: true,
            },
          ],
        ]
      }
      return [state, []]
    }
    switch (event.type) {
      case "pointerMove": {
        const hit = ctx.hitTest(event.at)
        if (!hit || state.erasedIds.includes(hit.id)) return [state, []]
        return [
          { phase: "erasing", erasedIds: [...state.erasedIds, hit.id] },
          [
            {
              kind: "mutation",
              apply: (draft) => setDeletedFlag(draft, hit.id, true),
              skipHistory: true,
            },
          ],
        ]
      }
      case "pointerUp": {
        const ids = state.erasedIds
        if (ids.length === 0) return [{ phase: "idle" }, []]
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                for (const id of ids) setDeletedFlag(draft, id, true)
              },
            },
          ],
        ]
      }
      case "escape": {
        const ids = state.erasedIds
        if (ids.length === 0) return [{ phase: "idle" }, []]
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                for (const id of ids) setDeletedFlag(draft, id, false)
              },
              skipHistory: true,
            },
          ],
        ]
      }
      default:
        return [state, []]
    }
  },
}
