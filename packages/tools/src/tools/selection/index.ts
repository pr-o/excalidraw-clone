import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../../types"
import { buildDragCommitEffect, buildDragMoveEffect, buildDragRevertEffect } from "./drag"
import { findHandleAt } from "./handles"
import { SELECTION_INITIAL, type SelectionState } from "./types"

export type { SelectionState } from "./types"
export { SELECTION_INITIAL } from "./types"
export { findHandleAt } from "./handles"
export type { HandleHit } from "./handles"
export type { ResizeHandle } from "./types"

const reduceIdle = (
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  if (event.type === "pointerDown") {
    // Prefer handle hits if they occur on a single-selected element.
    const handle = findHandleAt(event.at, ctx.selectedIds, ctx.readElements(), ctx.viewTransform)
    if (handle) {
      // Resize / rotate phases are wired up in Tasks 5.7 / 5.8. Until then we
      // fall through to drag-on-self so the click isn't lost.
      void handle
    }
    const hit = ctx.hitTest(event.at)
    if (!hit) {
      return [
        {
          phase: "marquee",
          start: event.at,
          current: event.at,
          baseSelection: ctx.modifiers.shift ? ctx.selectedIds : [],
        },
        ctx.modifiers.shift ? [] : [{ kind: "select", ids: [] }],
      ]
    }
    const alreadySelected = ctx.selectedIds.includes(hit.id)
    const movedIds = alreadySelected
      ? ctx.selectedIds
      : ctx.modifiers.shift
        ? [...ctx.selectedIds, hit.id]
        : [hit.id]
    const selectionEffects: readonly ToolEffect[] = alreadySelected
      ? []
      : ctx.modifiers.shift
        ? [{ kind: "addToSelection", ids: [hit.id] }]
        : [{ kind: "select", ids: [hit.id] }]
    return [{ phase: "dragging", start: event.at, last: event.at, movedIds }, selectionEffects]
  }
  if (event.type === "delete") {
    if (ctx.selectedIds.length === 0) return [{ phase: "idle" }, []]
    const ids = ctx.selectedIds
    return [
      { phase: "idle" },
      [
        {
          kind: "mutation",
          apply: (draft) => {
            for (let i = 0; i < draft.length; i += 1) {
              const e = draft[i]!
              if (ids.includes(e.id)) draft[i] = { ...e, isDeleted: true }
            }
          },
        },
        { kind: "select", ids: [] },
      ],
    ]
  }
  if (event.type === "escape") {
    if (ctx.selectedIds.length === 0) return [{ phase: "idle" }, []]
    return [{ phase: "idle" }, [{ kind: "select", ids: [] }]]
  }
  return [{ phase: "idle" }, []]
}

const reduceDragging = (
  state: Extract<SelectionState, { phase: "dragging" }>,
  event: ToolEvent,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      const dx = event.at.x - state.last.x
      const dy = event.at.y - state.last.y
      return [{ ...state, last: event.at }, [buildDragMoveEffect(state.movedIds, dx, dy)]]
    }
    case "pointerUp": {
      return [{ phase: "idle" }, [buildDragCommitEffect(state.movedIds)]]
    }
    case "escape": {
      return [{ phase: "idle" }, [buildDragRevertEffect(state.movedIds, state.start, state.last)]]
    }
    default:
      return [state, []]
  }
}

const reduceMarquee = (
  state: Extract<SelectionState, { phase: "marquee" }>,
  event: ToolEvent,
): [SelectionState, readonly ToolEffect[]] => {
  // Marquee tail (compute selection set on pointerUp) is implemented in Task 5.9.
  // For Task 5.6 we only handle the entry + exit transitions.
  if (event.type === "pointerMove") {
    return [{ ...state, current: event.at }, []]
  }
  if (event.type === "pointerUp" || event.type === "escape") {
    return [{ phase: "idle" }, []]
  }
  return [state, []]
}

export const selectionTool: Tool<SelectionState, ToolEvent> = {
  name: "selection",
  initial: SELECTION_INITIAL,
  reduce(state, event, ctx) {
    switch (state.phase) {
      case "idle":
        return reduceIdle(event, ctx)
      case "dragging":
        return reduceDragging(state, event)
      case "marquee":
        return reduceMarquee(state, event)
      case "resizing":
      case "rotating":
        // Implemented in Tasks 5.7 and 5.8.
        return [state, []]
    }
  },
}
