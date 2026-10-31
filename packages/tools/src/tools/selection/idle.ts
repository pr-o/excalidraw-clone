import { boundsCenter, type Point } from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  expandIdsToFrameMembers,
  expandIdsToGroups,
  getElementsBounds,
} from "@excalidraw-clone/scene"
import type { ToolContext, ToolEffect, ToolEvent } from "../../types"
import { buildBendInsertEffect } from "./bend"
import { reduceDoubleClick } from "./double-click"
import { snapshotLinear } from "./endpoint"
import { findHandleAt, type HandleHit } from "./handles"
import { snapshotElementBox } from "./resize"
import { pointerAngle } from "./rotate"
import type { Transition } from "./types"

/** Begin the gesture for a pressed handle, or null if its element is gone. */
const startHandleDrag = (
  handle: HandleHit,
  at: Point,
  elements: readonly ExcalidrawElement[],
): Transition | null => {
  if (handle.kind === "groupResize") {
    const selected = handle.ids
      .map((id) => elements.find((el) => el.id === id))
      .filter((el): el is ExcalidrawElement => !!el && !el.isDeleted)
    const bounds = getElementsBounds(selected)
    // Defensive: findHandleAt already required 2+ non-deleted members to
    // produce this hit from this same `elements` snapshot, so `bounds`
    // is never actually null here — kept for the same reason similar
    // guards are kept elsewhere in this codebase (cheap insurance).
    if (!bounds) return [{ phase: "idle" }, []]
    return [
      {
        phase: "groupResizing",
        handle: handle.handle,
        ids: handle.ids,
        origin: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          angle: 0,
        },
        originalElements: selected,
        start: at,
      },
      [],
    ]
  }
  const e = elements.find((el) => el.id === handle.elementId)
  if (e && handle.kind === "resize") {
    return [
      {
        phase: "resizing",
        handle: handle.handle,
        elementId: handle.elementId,
        origin: snapshotElementBox(e),
        start: at,
      },
      [],
    ]
  }
  if (e && e.type === "table" && handle.kind === "tableBorder") {
    return [
      {
        phase: "tableResizing",
        elementId: handle.elementId,
        axis: handle.axis,
        index: handle.index,
        original: e,
        start: at,
      },
      [],
    ]
  }
  if (e && handle.kind === "rotate") {
    const center = boundsCenter(e)
    return [
      {
        phase: "rotating",
        elementId: handle.elementId,
        origin: { angle: e.angle },
        center,
        pointerAngleAtStart: pointerAngle(center, at),
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
  return null
}

export const reduceIdle = (event: ToolEvent, ctx: ToolContext): Transition => {
  if (event.type === "pointerDown") {
    // Prefer handle hits if they occur on a single-selected element.
    const handle = findHandleAt(event.at, ctx.selectedIds, ctx.readElements(), ctx.viewTransform)
    const started = handle && startHandleDrag(handle, event.at, ctx.readElements())
    if (started) return started
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
    const baseMovedIds = alreadySelected
      ? ctx.selectedIds
      : ctx.modifiers.shift
        ? Array.from(new Set([...ctx.selectedIds, ...hitIds]))
        : hitIds
    const movedIds = expandIdsToFrameMembers(baseMovedIds, ctx.readElements())
    const selectionEffects: readonly ToolEffect[] = alreadySelected
      ? []
      : ctx.modifiers.shift
        ? [{ kind: "addToSelection", ids: hitIds }]
        : [{ kind: "select", ids: hitIds }]
    return [
      {
        phase: "dragging",
        start: event.at,
        last: event.at,
        movedIds,
        firstMove: true,
        alignDx: 0,
        alignDy: 0,
        gridSnapDx: 0,
        gridSnapDy: 0,
        ...(ctx.modifiers.alt ? { dupPending: true, dupRestore: baseMovedIds } : {}),
      },
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
  if (event.type === "doubleClick") return reduceDoubleClick(event.at, ctx)
  return [{ phase: "idle" }, []]
}
