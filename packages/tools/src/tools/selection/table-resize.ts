import { type ExcalidrawTableElement, setTrackSize, toTableLocal } from "@excalidraw-clone/scene"
import type { ToolEffect, ToolEvent } from "../../types"
import type { SelectionState, Transition } from "./types"

/** Replace the table with `next` (or its original on revert) in the draft. */
const putTable = (id: string, next: ExcalidrawTableElement, skipHistory: boolean): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === id)
    if (i >= 0) draft[i] = { ...next }
  },
  skipHistory,
})

export const reduceTableResizing = (
  state: Extract<SelectionState, { phase: "tableResizing" }>,
  event: ToolEvent,
): Transition => {
  const { elementId, axis, index, original, start } = state
  switch (event.type) {
    case "pointerMove": {
      // Measure along the table's own axes so a rotated table resizes correctly.
      const a = toTableLocal(original, start)
      const b = toTableLocal(original, event.at)
      const delta = axis === "col" ? b.x - a.x : b.y - a.y
      const track = axis === "col" ? original.colWidths[index]! : original.rowHeights[index]!
      return [
        state,
        [putTable(elementId, setTrackSize(original, axis, index, track + delta), true)],
      ]
    }
    case "pointerUp":
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => {
              const i = draft.findIndex((e) => e.id === elementId)
              if (i >= 0) draft[i] = { ...draft[i]! }
            },
          },
        ],
      ]
    case "escape":
      return [{ phase: "idle" }, [putTable(elementId, original, true)]]
    default:
      return [state, []]
  }
}
