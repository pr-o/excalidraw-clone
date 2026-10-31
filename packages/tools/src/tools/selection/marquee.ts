import { type Bounds, boundsContains, boundsFromPoints } from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  getElementBounds,
  expandIdsToGroups,
} from "@excalidraw-clone/scene"
import type { ToolContext, ToolEvent } from "../../types"
import type { SelectionState, Transition } from "./types"

export const marqueeBounds = (a: { x: number; y: number }, b: { x: number; y: number }): Bounds =>
  boundsFromPoints([a, b])

export const elementsInsideMarquee = (
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
    const bounds = marqueeBounds(state.start, event.at)
    const enclosed = expandIdsToGroups(
      elementsInsideMarquee(bounds, ctx.readElements()),
      ctx.readElements(),
    )
    if (state.baseSelection.length > 0) {
      const merged = Array.from(new Set([...state.baseSelection, ...enclosed]))
      return [{ phase: "idle" }, [{ kind: "select", ids: merged }]]
    }
    return [{ phase: "idle" }, [{ kind: "select", ids: enclosed }]]
  }
  if (event.type === "escape") {
    return [{ phase: "idle" }, []]
  }
  return [state, []]
}
