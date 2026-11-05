import {
  deleteElements,
  type ExcalidrawElement,
  expandIdsToFrameMembers,
  expandIdsToGroups,
  getElementsBounds,
  isLinearElement,
} from "@excalidraw-clone/scene"
import { boundsCenter, type Point } from "@excalidraw-clone/geometry"
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
    // findHandleAt only reports this handle for 2+ live members, so this is a guard.
    const bounds = getElementsBounds(selected)
    if (!bounds) return [{ phase: "idle" }, []]
    return [
      {
        phase: "groupResizing",
        handle: handle.handle,
        ids: handle.ids,
        origin: { ...bounds, angle: 0 },
        originalElements: selected,
        start: at,
      },
      [],
    ]
  }
  const e = elements.find((el) => el.id === handle.elementId)
  if (!e) return null
  const { elementId } = handle
  switch (handle.kind) {
    case "resize":
      return [
        {
          phase: "resizing",
          handle: handle.handle,
          elementId,
          origin: snapshotElementBox(e),
          start: at,
        },
        [],
      ]
    case "tableBorder":
      if (e.type !== "table") return null
      return [
        {
          phase: "tableResizing",
          elementId,
          axis: handle.axis,
          index: handle.index,
          original: e,
          start: at,
        },
        [],
      ]
    case "rotate": {
      const center = boundsCenter(e)
      return [
        {
          phase: "rotating",
          elementId,
          origin: { angle: e.angle },
          center,
          pointerAngleAtStart: pointerAngle(center, at),
        },
        [],
      ]
    }
    case "endpoint":
      if (!isLinearElement(e)) return null
      return [
        {
          phase: "endpointDragging",
          elementId,
          end: handle.end,
          origin: snapshotLinear(e),
          candidateBindId: null,
        },
        [],
      ]
    case "bend":
      if (!isLinearElement(e)) return null
      return [
        { phase: "bendDragging", elementId, index: handle.index, origin: snapshotLinear(e) },
        [],
      ]
    case "bendAdd": {
      if (!isLinearElement(e)) return null
      // A new bend point is inserted, then dragged like an existing one.
      const index = handle.segmentIndex + 1
      return [
        { phase: "bendDragging", elementId, index, origin: snapshotLinear(e) },
        [buildBendInsertEffect(elementId, index, handle.at)],
      ]
    }
  }
}

export const reduceIdle = (event: ToolEvent, ctx: ToolContext): Transition => {
  if (event.type === "pointerDown") {
    const elements = ctx.readElements()
    // A handle of the selection wins over the element under it.
    const handle = findHandleAt(event.at, ctx.selectedIds, elements, ctx.viewTransform)
    const started = handle && startHandleDrag(handle, event.at, elements)
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
    const hitIds = expandIdsToGroups([hit.id], elements)
    const baseMovedIds = alreadySelected
      ? ctx.selectedIds
      : ctx.modifiers.shift
        ? Array.from(new Set([...ctx.selectedIds, ...hitIds]))
        : hitIds
    const movedIds = expandIdsToFrameMembers(baseMovedIds, elements)
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
        { kind: "mutation", apply: (draft) => deleteElements(draft, ids) },
        { kind: "select", ids: [] },
      ],
    ]
  }
  if (event.type === "escape") {
    if (ctx.selectedIds.length === 0) return [{ phase: "idle" }, []]
    return [{ phase: "idle" }, [{ kind: "select", ids: [] }]]
  }
  if (event.type === "doubleClick") return reduceDoubleClick(event.at, ctx, event.targetId)
  return [{ phase: "idle" }, []]
}
