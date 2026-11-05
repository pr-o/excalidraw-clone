import { snapPointToGrid } from "@excalidraw-clone/geometry"
import {
  type ExcalidrawArrowElement,
  type ExcalidrawElement,
  removeBackRef,
  duplicateElements,
  isBoundLabel,
} from "@excalidraw-clone/scene"
import type { ToolEffect, ToolContext, ToolEvent } from "../../types"
import { CLEAR_GUIDES } from "../../types"
import { addDraftEffect, discardDraftEffect } from "../../draft"
import { buildRecommitEffect } from "./recommit"
import { computeDragAlignment } from "./alignment"
import type { SelectionState, Transition } from "./types"

const unbindMovedArrow = (
  draft: ExcalidrawElement[],
  arrow: ExcalidrawArrowElement,
  movedIds: ReadonlySet<string>,
): ExcalidrawArrowElement => {
  let startBinding = arrow.startBinding
  let endBinding = arrow.endBinding
  if (startBinding && !movedIds.has(startBinding.elementId)) {
    removeBackRef(draft, startBinding.elementId, arrow.id)
    startBinding = null
  }
  if (endBinding && !movedIds.has(endBinding.elementId)) {
    removeBackRef(draft, endBinding.elementId, arrow.id)
    endBinding = null
  }
  if (startBinding === arrow.startBinding && endBinding === arrow.endBinding) return arrow
  return { ...arrow, startBinding, endBinding }
}

export const translateElements = (
  draft: ExcalidrawElement[],
  ids: readonly string[],
  dx: number,
  dy: number,
): void => {
  if (dx === 0 && dy === 0) return
  const movedIds = new Set(ids)
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (!movedIds.has(e.id)) continue
    let next: ExcalidrawElement = { ...e, x: e.x + dx, y: e.y + dy }
    if (next.type === "arrow") {
      next = unbindMovedArrow(draft, next, movedIds)
    }
    draft[i] = next
  }
}

const buildDragMoveEffect = (ids: readonly string[], dx: number, dy: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => translateElements(draft, ids, dx, dy),
  skipHistory: true,
})

/** Undoes a drag by translating by the negation of the total translation
 *  applied over the drag (raw pointer travel plus any baked-in alignment
 *  correction). */
const buildDragRevertEffect = (
  ids: readonly string[],
  appliedDx: number,
  appliedDy: number,
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => translateElements(draft, ids, -appliedDx, -appliedDy),
  skipHistory: true,
})

export const reduceDragging = (
  state: Extract<SelectionState, { phase: "dragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      if (state.dupPending) {
        // Alt-drag: leave the originals in place and drag fresh copies. Spending
        // this move on creation loses no distance — the next one measures from `last`.
        const copies = duplicateElements(ctx.readElements(), state.movedIds, 0)
        const dupIds = copies.map((c) => c.id)
        const selectable = copies.filter((c) => !isBoundLabel(c))
        return [
          { ...state, dupPending: false, dupIds, movedIds: dupIds },
          [addDraftEffect(...copies), { kind: "select", ids: selectable.map((c) => c.id) }],
        ]
      }
      if (state.firstMove && ctx.grid.enabled) {
        const elements = ctx.readElements()
        const anchor = elements.find((e) => state.movedIds.includes(e.id))
        if (anchor) {
          const snapped = snapPointToGrid({ x: anchor.x, y: anchor.y }, ctx.grid, {
            ctrl: ctx.modifiers.ctrl,
            meta: ctx.modifiers.meta,
          })
          const gridSnapDx = snapped.x - anchor.x
          const gridSnapDy = snapped.y - anchor.y
          const dx = gridSnapDx + (event.at.x - state.last.x)
          const dy = gridSnapDy + (event.at.y - state.last.y)
          return [
            {
              ...state,
              last: event.at,
              firstMove: false,
              alignDx: 0,
              alignDy: 0,
              gridSnapDx,
              gridSnapDy,
            },
            [buildDragMoveEffect(state.movedIds, dx, dy), CLEAR_GUIDES],
          ]
        }
      }
      const rawDx = event.at.x - state.last.x
      const rawDy = event.at.y - state.last.y
      if (ctx.grid.enabled) {
        // Grid governs: drop any alignment correction left from a grid-off
        // stretch of this drag so the invariant (live = original + pointer
        // travel + alignDx/Dy) holds when the grid is toggled mid-drag.
        return [
          { ...state, last: event.at, firstMove: false, alignDx: 0, alignDy: 0 },
          [
            buildDragMoveEffect(state.movedIds, rawDx - state.alignDx, rawDy - state.alignDy),
            CLEAR_GUIDES,
          ],
        ]
      }
      const { dx, dy, alignDx, alignDy, guides } = computeDragAlignment(
        state.movedIds,
        rawDx,
        rawDy,
        state.alignDx,
        state.alignDy,
        ctx,
      )
      return [
        { ...state, last: event.at, firstMove: false, alignDx, alignDy },
        [buildDragMoveEffect(state.movedIds, dx, dy), { kind: "setGuides", guides }],
      ]
    }
    case "pointerUp": {
      return [{ phase: "idle" }, [buildRecommitEffect(state.movedIds), CLEAR_GUIDES]]
    }
    case "escape": {
      if (state.dupIds) {
        return [
          { phase: "idle" },
          [
            discardDraftEffect(...state.dupIds),
            { kind: "select", ids: state.dupRestore ?? [] },
            CLEAR_GUIDES,
          ],
        ]
      }
      return [
        { phase: "idle" },
        [
          buildDragRevertEffect(
            state.movedIds,
            state.last.x - state.start.x + state.alignDx + state.gridSnapDx,
            state.last.y - state.start.y + state.alignDy + state.gridSnapDy,
          ),
          CLEAR_GUIDES,
        ],
      ]
    }
    default:
      return [state, []]
  }
}
