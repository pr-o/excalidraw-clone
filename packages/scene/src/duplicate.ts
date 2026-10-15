import { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
import type { ExcalidrawElement } from "./types"

const DUPLICATE_OFFSET = 12

/** Clones the copy-closure of `ids` (frame members + bound labels included)
 *  with fresh ids, offset from the originals by `offset` (default +12/+12).
 *  Positions only — callers push the result into the scene and select it. */
export function duplicateElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  offset = DUPLICATE_OFFSET,
): ExcalidrawElement[] {
  const picked = expandIdsToCopyClosure(ids, elements)
  return cloneElementsWithNewIds(picked).map((el) => ({
    ...el,
    x: el.x + offset,
    y: el.y + offset,
  }))
}
