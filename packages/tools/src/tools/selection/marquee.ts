import { type Bounds, boundsContains, boundsFromPoints } from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  getElementBounds,
  expandIdsToGroups,
} from "@excalidraw-clone/scene"
import type { ToolContext, ToolEvent } from "../../types"
import type { SelectionState, Transition } from "./types"

/** Live, unlocked elements lying wholly inside the marquee. */
const elementsInsideMarquee = (
  marquee: Bounds,
  elements: readonly ExcalidrawElement[],
): readonly string[] => {
  const ids: string[] = []
  for (const e of elements) {
    if (e.isDeleted) continue
    if (e.locked) continue
    const b = getElementBounds(e)
    if (boundsContains(marquee, b)) ids.push(e.id)
  }
  return ids
}

export const reduceMarquee = (
  state: Extract<SelectionState, { phase: "marquee" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  if (event.type === "pointerMove") {
    return [{ ...state, current: event.at }, []]
  }
  if (event.type === "pointerUp") {
    const elements = ctx.readElements()
    const marquee = boundsFromPoints([state.start, event.at])
    const enclosed = expandIdsToGroups(elementsInsideMarquee(marquee, elements), elements)
    // Shift-marquee adds to the selection it started from.
    const ids = [...new Set([...state.baseSelection, ...enclosed])]
    return [{ phase: "idle" }, [{ kind: "select", ids }]]
  }
  if (event.type === "escape") {
    return [{ phase: "idle" }, []]
  }
  return [state, []]
}
