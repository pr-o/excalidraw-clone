import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, expandIdsToGroups, hitTestElement } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

type Erasing = {
  phase: "erasing"
  /** Live elements at pointerDown. Escape puts them back verbatim, which also restores
   *  the labels, arrow bindings and frame membership the scene's reconcile pass dropped. */
  before: readonly ExcalidrawElement[]
  erasedIds: readonly string[]
  /** Every pointer position of this drag; drawn as the overlay trail. */
  trail: readonly Point[]
}

export type EraserState = { phase: "idle" } | Erasing

const ERASER_INITIAL: EraserState = { phase: "idle" }

/** Hit-test spacing along a drag, in screen px, so fast drags can't jump over thin lines. */
const STEP_PX = 4

/** Points from `a` (exclusive) to `b` (inclusive), at most `step` apart. */
const samplesBetween = (a: Point, b: Point, step: number): Point[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * (i + 1)) / n,
    y: a.y + ((b.y - a.y) * (i + 1)) / n,
  }))
}

/** Locked elements stay; bound labels go with their container (reconcileBoundText). */
const erasable = (e: ExcalidrawElement): boolean =>
  !e.locked && !(e.type === "text" && e.containerId !== null)

/** Ids of erasable elements under any of `points`, widened to whole groups, minus `skip`. */
const idsUnder = (
  points: readonly Point[],
  elements: readonly ExcalidrawElement[],
  skip: ReadonlySet<string>,
): string[] => {
  const hit = elements
    .filter((e) => !skip.has(e.id) && erasable(e) && points.some((p) => hitTestElement(e, p)))
    .map((e) => e.id)
  if (hit.length === 0) return []
  const byId = new Map(elements.map((e) => [e.id, e]))
  return expandIdsToGroups(hit, elements).filter((id) => {
    const e = byId.get(id)
    return e !== undefined && !skip.has(id) && erasable(e)
  })
}

const markDeleted =
  (ids: readonly string[]) =>
  (draft: ExcalidrawElement[]): void => {
    const set = new Set(ids)
    for (let i = 0; i < draft.length; i += 1) {
      const e = draft[i]!
      if (set.has(e.id) && !e.isDeleted) draft[i] = { ...e, isDeleted: true }
    }
  }

const restore =
  (before: readonly ExcalidrawElement[]) =>
  (draft: ExcalidrawElement[]): void => {
    const byId = new Map(before.map((e) => [e.id, e]))
    for (let i = 0; i < draft.length; i += 1) {
      const original = byId.get(draft[i]!.id)
      if (original) draft[i] = original
    }
  }

const eraseAt = (
  state: Erasing,
  points: readonly Point[],
  ctx: ToolContext,
): [EraserState, readonly ToolEffect[]] => {
  const ids = idsUnder(points, ctx.readElements(), new Set(state.erasedIds))
  if (ids.length === 0) return [state, NO_EFFECTS]
  return [
    { ...state, erasedIds: [...state.erasedIds, ...ids] },
    [{ kind: "mutation", apply: markDeleted(ids), skipHistory: true }],
  ]
}

export const eraserTool: Tool<EraserState, ToolEvent> = {
  name: "eraser",
  initial: ERASER_INITIAL,
  reduce(state, event, ctx) {
    if (state.phase === "idle") {
      if (event.type !== "pointerDown") return [state, NO_EFFECTS]
      return eraseAt(
        { phase: "erasing", before: ctx.readElements(), erasedIds: [], trail: [event.at] },
        [event.at],
        ctx,
      )
    }
    switch (event.type) {
      case "pointerMove": {
        const last = state.trail[state.trail.length - 1] ?? event.at
        const samples = samplesBetween(last, event.at, STEP_PX / ctx.viewTransform.zoom)
        return eraseAt({ ...state, trail: [...state.trail, event.at] }, samples, ctx)
      }
      case "pointerUp":
        // The live soft-deletes skipped history; this one commit makes the drag one undo step.
        return [
          ERASER_INITIAL,
          state.erasedIds.length === 0
            ? NO_EFFECTS
            : [{ kind: "mutation", apply: markDeleted(state.erasedIds) }],
        ]
      case "escape":
        return [
          ERASER_INITIAL,
          state.erasedIds.length === 0
            ? NO_EFFECTS
            : [{ kind: "mutation", apply: restore(state.before), skipHistory: true }],
        ]
      default:
        return [state, NO_EFFECTS]
    }
  },
}
