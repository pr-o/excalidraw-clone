import { boundsContains } from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import type { ExcalidrawElement } from "./types"

/**
 * Enforce frame membership as a scene invariant on a mutation draft: every
 * non-deleted, non-frame element's frameId is the topmost (last in scene
 * order) non-deleted frame whose bounds fully contain the element's bounds,
 * or null when no frame contains it. Bound labels (text with a containerId)
 * are skipped — they follow their container. Deleted frames therefore
 * release their members. Idempotent and reference-stable on no-op.
 */
export function reconcileFrameMembership(draft: ExcalidrawElement[]): void {
  const frames = draft.filter((e) => e.type === "frame" && !e.isDeleted)
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (e.isDeleted) continue
    if (e.type === "frame") continue
    if (e.type === "text" && e.containerId !== null) continue
    let owner: string | null = null
    const eb = getElementBounds(e)
    for (const frame of frames) {
      const fb = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      if (boundsContains(fb, eb)) owner = frame.id
    }
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
