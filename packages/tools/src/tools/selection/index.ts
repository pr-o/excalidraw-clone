import type { Tool, ToolEvent } from "../../types"
import { reduceBend } from "./bend"
import { reduceCropDragging, reduceCropping } from "./crop"
import { reduceDragging } from "./drag"
import { reduceEndpoint } from "./endpoint"
import { reduceGroupResizing } from "./group-resize"
import { reduceIdle } from "./idle"
import { reduceMarquee } from "./marquee"
import { reduceResizing } from "./resize"
import { reduceRotating } from "./rotate"
import { reduceTableResizing } from "./table-resize"
import { SELECTION_INITIAL, type SelectionState } from "./types"

export type { SelectionState } from "./types"
export { SELECTION_INITIAL } from "./types"
export { findHandleAt } from "./handles"
export type { HandleHit } from "./handles"
export type { ResizeHandle } from "./types"

export const selectionTool: Tool<SelectionState, ToolEvent> = {
  name: "selection",
  initial: SELECTION_INITIAL,
  reduce(state, event, ctx) {
    switch (state.phase) {
      case "idle":
        return reduceIdle(event, ctx)
      case "dragging":
        return reduceDragging(state, event, ctx)
      case "marquee":
        return reduceMarquee(state, event, ctx)
      case "resizing":
        return reduceResizing(state, event, ctx)
      case "groupResizing":
        return reduceGroupResizing(state, event, ctx)
      case "rotating":
        return reduceRotating(state, event, ctx)
      case "endpointDragging":
        return reduceEndpoint(state, event, ctx)
      case "bendDragging":
        return reduceBend(state, event)
      case "tableResizing":
        return reduceTableResizing(state, event)
      case "cropping":
        return reduceCropping(state, event, ctx)
      case "cropDragging":
        return reduceCropDragging(state, event, ctx)
    }
  },
}
