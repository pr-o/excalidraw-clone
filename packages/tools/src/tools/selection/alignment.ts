import { computeAlignmentSnap, type AlignmentGuide } from "@excalidraw-clone/geometry"
import { getElementBounds, getElementsBounds } from "@excalidraw-clone/scene"
import type { ToolContext } from "../../types"

const ALIGNMENT_THRESHOLD_SCREEN_PX = 8

export interface DragAlignment {
  dx: number
  dy: number
  guides: readonly AlignmentGuide[]
}

/** Extra snap correction against other elements' edges/centers, folded on
 *  top of a raw pointer-delta drag translation. Bypassed by Ctrl/Meta,
 *  mirroring `snapPointToGrid`'s exact modifier check. A multi-selection's
 *  moving bounds is the combined bbox of every dragged element
 *  (`getElementsBounds`), matching the multi-element-resize precedent.
 *  Candidates are every non-deleted, non-locked element not being dragged. */
export const computeDragAlignment = (
  movedIds: readonly string[],
  dx: number,
  dy: number,
  ctx: ToolContext,
): DragAlignment => {
  if (ctx.modifiers.ctrl || ctx.modifiers.meta) return { dx, dy, guides: [] }
  const elements = ctx.readElements()
  const movedSet = new Set(movedIds)
  const movedElements = elements.filter((e) => movedSet.has(e.id))
  const currentBounds = getElementsBounds(movedElements)
  if (!currentBounds) return { dx, dy, guides: [] }
  const movingBounds = {
    x: currentBounds.x + dx,
    y: currentBounds.y + dy,
    width: currentBounds.width,
    height: currentBounds.height,
  }
  const candidateBounds = elements
    .filter((e) => !e.isDeleted && !e.locked && !movedSet.has(e.id))
    .map(getElementBounds)
  const threshold = ALIGNMENT_THRESHOLD_SCREEN_PX / ctx.viewTransform.zoom
  const snap = computeAlignmentSnap(movingBounds, candidateBounds, threshold)
  return { dx: dx + snap.dx, dy: dy + snap.dy, guides: snap.guides }
}
