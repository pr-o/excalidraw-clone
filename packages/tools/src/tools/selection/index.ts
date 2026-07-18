import { snapPointToGrid } from "@excalidraw-clone/geometry"
import {
  bindingTargetAt,
  expandIdsToGroups,
  LABELABLE_TYPES,
  newLabelFor,
  newLabelForLinear,
} from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../../types"
import {
  buildBendCommitEffect,
  buildBendInsertEffect,
  buildBendMoveEffect,
  buildBendRemoveEffect,
  buildBendRevertEffect,
} from "./bend"
import { buildDragCommitEffect, buildDragMoveEffect, buildDragRevertEffect } from "./drag"
import {
  buildEndpointCommitEffect,
  buildEndpointMoveEffect,
  buildEndpointRevertEffect,
  snapshotLinear,
} from "./endpoint"
import { findHandleAt } from "./handles"
import { elementsInsideMarquee, marqueeBounds } from "./marquee"
import {
  buildResizeCommitEffect,
  buildResizeMoveEffect,
  buildResizeRevertEffect,
  snapshotElementBox,
} from "./resize"
import {
  buildRotateCommitEffect,
  buildRotateMoveEffect,
  buildRotateRevertEffect,
  computeRotation,
  elementCenter,
  pointerAngle,
} from "./rotate"
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
      const elements = ctx.readElements()
      const e = elements.find((el) => el.id === handle.elementId)
      if (e && handle.kind === "resize") {
        return [
          {
            phase: "resizing",
            handle: handle.handle,
            elementId: handle.elementId,
            origin: snapshotElementBox(e),
            start: event.at,
          },
          [],
        ]
      }
      if (e && handle.kind === "rotate") {
        const center = elementCenter(e)
        return [
          {
            phase: "rotating",
            elementId: handle.elementId,
            origin: { angle: e.angle },
            center,
            pointerAngleAtStart: pointerAngle(center, event.at),
          },
          [],
        ]
      }
      if (e && handle.kind === "endpoint") {
        return [
          {
            phase: "endpointDragging",
            elementId: handle.elementId,
            end: handle.end,
            origin: snapshotLinear(e),
            candidateBindId: null,
          },
          [],
        ]
      }
      if (e && handle.kind === "bend") {
        return [
          {
            phase: "bendDragging",
            elementId: handle.elementId,
            index: handle.index,
            origin: snapshotLinear(e),
          },
          [],
        ]
      }
      if (e && handle.kind === "bendAdd") {
        return [
          {
            phase: "bendDragging",
            elementId: handle.elementId,
            index: handle.segmentIndex + 1,
            origin: snapshotLinear(e),
          },
          [buildBendInsertEffect(handle.elementId, handle.segmentIndex + 1, handle.at)],
        ]
      }
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
    const hitIds = expandIdsToGroups([hit.id], ctx.readElements())
    const movedIds = alreadySelected
      ? ctx.selectedIds
      : ctx.modifiers.shift
        ? Array.from(new Set([...ctx.selectedIds, ...hitIds]))
        : hitIds
    const selectionEffects: readonly ToolEffect[] = alreadySelected
      ? []
      : ctx.modifiers.shift
        ? [{ kind: "addToSelection", ids: hitIds }]
        : [{ kind: "select", ids: hitIds }]
    return [
      { phase: "dragging", start: event.at, last: event.at, movedIds, firstMove: true },
      selectionEffects,
    ]
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
  if (event.type === "doubleClick") {
    const bendHandle = findHandleAt(
      event.at,
      ctx.selectedIds,
      ctx.readElements(),
      ctx.viewTransform,
    )
    if (bendHandle && bendHandle.kind === "bend") {
      return [{ phase: "idle" }, [buildBendRemoveEffect(bendHandle.elementId, bendHandle.index)]]
    }
    const hit = ctx.hitTest(event.at)
    if (hit) {
      const soleSelection = ctx.selectedIds.length === 1 && ctx.selectedIds[0] === hit.id
      if (hit.groupIds.length > 0 && !soleSelection) {
        return [{ phase: "idle" }, [{ kind: "select", ids: [hit.id] }]]
      }
      if (hit.type === "text") {
        return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: hit.id }]]
      }
      const textRef = hit.boundElements?.find((b) => b.type === "text")
      if (textRef) {
        return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: textRef.id }]]
      }
      const isLinear = hit.type === "arrow" || hit.type === "line"
      if (LABELABLE_TYPES.has(hit.type) || isLinear) {
        const label = isLinear ? newLabelForLinear(hit) : newLabelFor(hit)
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                const i = draft.findIndex((e) => e.id === hit.id)
                if (i < 0) return
                const c = draft[i]!
                draft[i] = {
                  ...c,
                  boundElements: [...(c.boundElements ?? []), { id: label.id, type: "text" }],
                }
                draft.push(label)
              },
              skipHistory: true,
            },
            { kind: "select", ids: [hit.id] },
            { kind: "startTextEdit", elementId: label.id },
          ],
        ]
      }
    }
    return [{ phase: "idle" }, []]
  }
  return [{ phase: "idle" }, []]
}

const reduceDragging = (
  state: Extract<SelectionState, { phase: "dragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      if (state.firstMove && ctx.grid.enabled) {
        const elements = ctx.readElements()
        const anchor = elements.find((e) => state.movedIds.includes(e.id))
        if (anchor) {
          const snapped = snapPointToGrid({ x: anchor.x, y: anchor.y }, ctx.grid, {
            ctrl: ctx.modifiers.ctrl,
            meta: ctx.modifiers.meta,
          })
          const dx = snapped.x - anchor.x + (event.at.x - state.last.x)
          const dy = snapped.y - anchor.y + (event.at.y - state.last.y)
          return [
            { ...state, last: event.at, firstMove: false },
            [buildDragMoveEffect(state.movedIds, dx, dy)],
          ]
        }
      }
      const dx = event.at.x - state.last.x
      const dy = event.at.y - state.last.y
      return [
        { ...state, last: event.at, firstMove: false },
        [buildDragMoveEffect(state.movedIds, dx, dy)],
      ]
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
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
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

const reduceResizing = (
  state: Extract<SelectionState, { phase: "resizing" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      return [
        state,
        [
          buildResizeMoveEffect(
            state.elementId,
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
      return [{ phase: "idle" }, [buildResizeCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildResizeRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}

const reduceRotating = (
  state: Extract<SelectionState, { phase: "rotating" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      const current = pointerAngle(state.center, event.at)
      const newAngle = computeRotation(
        state.origin,
        state.pointerAngleAtStart,
        current,
        ctx.modifiers,
      )
      return [state, [buildRotateMoveEffect(state.elementId, newAngle)]]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildRotateCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildRotateRevertEffect(state.elementId, state.origin.angle)]]
    default:
      return [state, []]
  }
}

const reduceEndpoint = (
  state: Extract<SelectionState, { phase: "endpointDragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      const candidate = bindingTargetAt(event.at, ctx.readElements())
      return [
        { ...state, candidateBindId: candidate?.id ?? null },
        [buildEndpointMoveEffect(state.elementId, state.end, event.at)],
      ]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildEndpointCommitEffect(state.elementId, state.end)]]
    case "escape":
      return [{ phase: "idle" }, [buildEndpointRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}

const reduceBend = (
  state: Extract<SelectionState, { phase: "bendDragging" }>,
  event: ToolEvent,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove":
      return [state, [buildBendMoveEffect(state.elementId, state.index, event.at)]]
    case "pointerUp":
      return [{ phase: "idle" }, [buildBendCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildBendRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}

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
      case "rotating":
        return reduceRotating(state, event, ctx)
      case "endpointDragging":
        return reduceEndpoint(state, event, ctx)
      case "bendDragging":
        return reduceBend(state, event)
    }
  },
}
