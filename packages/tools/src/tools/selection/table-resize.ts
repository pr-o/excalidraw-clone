import { type ExcalidrawTableElement, setTrackSize, toTableLocal } from "@excalidraw-clone/scene"
import { replaceElements } from "../../draft"
import type { ToolEffect, ToolEvent } from "../../types"
import { buildRecommitEffect } from "./recommit"
import type { SelectionState, Transition } from "./types"

/** Live (history-free) replacement of the table: a resized copy, or its original on revert. */
const putTable = (next: ExcalidrawTableElement): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => replaceElements(draft, [{ ...next }]),
  skipHistory: true,
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
      return [state, [putTable(setTrackSize(original, axis, index, track + delta))]]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildRecommitEffect([elementId])]]
    case "escape":
      return [{ phase: "idle" }, [putTable(original)]]
    default:
      return [state, []]
  }
}
