import { computeAlignmentSnap, type AlignmentGuide } from "@excalidraw-clone/geometry"
import { getElementBounds, getElementsBounds } from "@excalidraw-clone/scene"
import type { ToolContext } from "../../types"

const ALIGNMENT_THRESHOLD_SCREEN_PX = 8

export interface DragAlignment {
  /** Relative translation to apply to the live (already-corrected) elements. */
  dx: number
  dy: number
  /** New cumulative alignment correction baked into the live elements after
   *  applying `dx`/`dy` — store it back into the drag state. */
  alignDx: number
  alignDy: number
  guides: readonly AlignmentGuide[]
}

/** Snap correction against other elements' edges/centers for one drag move.
 *
 *  The live elements already carry the previous move's correction
 *  (`prevAlignDx`/`prevAlignDy`), so the uncorrected target bounds are
 *  `liveBounds - prevAlign + rawDelta`. The new correction is computed
 *  against those, and the returned relative `dx`/`dy` swaps the old
 *  correction for the new one: `raw + newAlign - prevAlign`. This keeps the
 *  invariant `live = original + pointerTravel + currentAlign`, so an element
 *  never gets glued to a guide by small per-event deltas.
 *
 *  Bypassed by Ctrl/Meta (mirroring `snapPointToGrid`'s modifier check), in
 *  which case any previous correction is removed. A multi-selection's moving
 *  bounds is the combined bbox of every dragged element. Candidates are every
 *  non-deleted, non-locked element not being dragged, excluding bound text
 *  labels (their stored geometry doesn't follow a container drag). */
export const computeDragAlignment = (
  movedIds: readonly string[],
  rawDx: number,
  rawDy: number,
  prevAlignDx: number,
  prevAlignDy: number,
  ctx: ToolContext,
): DragAlignment => {
  const unsnapped: DragAlignment = {
    dx: rawDx - prevAlignDx,
    dy: rawDy - prevAlignDy,
    alignDx: 0,
    alignDy: 0,
    guides: [],
  }
  if (ctx.modifiers.ctrl || ctx.modifiers.meta) return unsnapped
  const elements = ctx.readElements()
  const movedSet = new Set(movedIds)
  const movedElements = elements.filter((e) => movedSet.has(e.id))
  const liveBounds = getElementsBounds(movedElements)
  if (!liveBounds) return unsnapped
  const movingBounds = {
    x: liveBounds.x - prevAlignDx + rawDx,
    y: liveBounds.y - prevAlignDy + rawDy,
    width: liveBounds.width,
    height: liveBounds.height,
  }
  const candidateBounds = elements
    .filter(
      (e) =>
        !e.isDeleted &&
        !e.locked &&
        !movedSet.has(e.id) &&
        !(e.type === "text" && e.containerId !== null),
    )
    .map(getElementBounds)
  const threshold = ALIGNMENT_THRESHOLD_SCREEN_PX / ctx.viewTransform.zoom
  const snap = computeAlignmentSnap(movingBounds, candidateBounds, threshold)
  return {
    dx: rawDx + snap.dx - prevAlignDx,
    dy: rawDy + snap.dy - prevAlignDy,
    alignDx: snap.dx,
    alignDy: snap.dy,
    guides: snap.guides,
  }
}
