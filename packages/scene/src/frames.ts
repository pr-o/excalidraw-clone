import { boundsContains } from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import type { ExcalidrawElement } from "./types"
import { isBoundLabel } from "./bound-label"

/**
 * Enforce frame membership as a scene invariant on a mutation draft: every
 * non-deleted, non-frame element's frameId is the topmost (last in scene
 * order) non-deleted frame whose bounds fully contain the element's bounds,
 * or null when no frame contains it. Bound labels (text with a containerId)
 * are skipped — they follow their container. Deleted frames therefore
 * release their members. Idempotent and reference-stable on no-op.
 *
 * `reconciledPrev`: an array this function already reconciled. When the draft
 * has exactly the same frames (by reference, in order), elements carried over
 * unchanged from it are already correct, so only new/replaced ones are checked.
 */
export function reconcileFrameMembership(
  draft: ExcalidrawElement[],
  reconciledPrev?: readonly ExcalidrawElement[],
): void {
  const frames = draft.filter((e) => e.type === "frame" && !e.isDeleted)
  let unchanged: Set<ExcalidrawElement> | null = null
  if (reconciledPrev) {
    const prevFrames = reconciledPrev.filter((e) => e.type === "frame" && !e.isDeleted)
    if (prevFrames.length === frames.length && prevFrames.every((f, i) => f === frames[i]))
      unchanged = new Set(reconciledPrev)
  }
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (unchanged?.has(e)) continue
    if (e.isDeleted) continue
    if (e.type === "frame") continue
    if (isBoundLabel(e)) continue
    let owner: string | null = null
    const eb = getElementBounds(e)
    for (const frame of frames) if (boundsContains(frame, eb)) owner = frame.id
    if (e.frameId !== owner) draft[i] = { ...e, frameId: owner }
  }
}

/**
 * Expands ids to include every non-deleted member of any non-deleted frame
 * in `ids`. Input ids pass through; no duplicates. Used to make dragging a
 * frame carry its members.
 */
export function expandIdsToFrameMembers(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
): string[] {
  const idSet = new Set(ids)
  const frameIds = new Set<string>()
  for (const el of elements) {
    if (el.type === "frame" && !el.isDeleted && idSet.has(el.id)) frameIds.add(el.id)
  }
  const result = [...ids]
  const seen = new Set(ids)
  for (const el of elements) {
    if (el.isDeleted) continue
    if (el.frameId !== null && frameIds.has(el.frameId) && !seen.has(el.id)) {
      seen.add(el.id)
      result.push(el.id)
    }
  }
  return result
}
