import { replaceElements, type ExcalidrawElement, resizeElements } from "@excalidraw-clone/scene"
import type { Point } from "@excalidraw-clone/geometry"
import type { Modifiers, ToolEffect, ToolContext, ToolEvent } from "../../types"
import { buildRecommitEffect } from "./recommit"
import { anchorSides, computeResize, type ResizeOrigin } from "./resize"
import type { ResizeHandle, SelectionState, Transition } from "./types"

/** Absolute, path-independent per-frame move effect: always scales from the
 *  pristine `originalElements` snapshot captured at pointerDown, relative
 *  to the frozen `origin` box — never from the live (possibly
 *  already-mutated) draft. This mirrors how the existing single-element
 *  `buildResizeMoveEffect` always recomputes the whole box from `origin` +
 *  total pointer displacement rather than accumulating incremental deltas,
 *  so repeated pointerMove events (and an eventual escape/revert) stay
 *  exact regardless of path or of the text fontSize floor clamp in
 *  `resizeElements`. */
export const buildGroupResizeMoveEffect = (
  ids: readonly string[],
  originalElements: readonly ExcalidrawElement[],
  origin: ResizeOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  modifiers: Modifiers,
): ToolEffect => {
  const box = computeResize(origin, handle, start, at, modifiers)
  return {
    kind: "mutation",
    apply: (draft) =>
      replaceElements(
        draft,
        resizeElements(originalElements, ids, origin, box, anchorSides(origin, handle, box)),
      ),
    skipHistory: true,
  }
}

/** Escape: every member back as it was at pointerDown. */
const buildGroupResizeRevertEffect = (
  originalElements: readonly ExcalidrawElement[],
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => replaceElements(draft, originalElements),
  skipHistory: true,
})

export const reduceGroupResizing = (
  state: Extract<SelectionState, { phase: "groupResizing" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      return [
        state,
        [
          buildGroupResizeMoveEffect(
            state.ids,
            state.originalElements,
            state.origin,
            state.handle,
            state.start,
            event.at,
            ctx.modifiers,
          ),
        ],
      ]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildRecommitEffect(state.ids)]]
    case "escape":
      return [{ phase: "idle" }, [buildGroupResizeRevertEffect(state.originalElements)]]
    default:
      return [state, []]
  }
}
