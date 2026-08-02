import { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
import type { ExcalidrawElement } from "./types"

const DUPLICATE_OFFSET = 12

/** Clones the copy-closure of `ids` (frame members + bound labels included)
 *  with fresh ids, offset by a fixed +12/+12 from the originals. Positions
 *  only — callers push the result into the scene and select it. */
export function duplicateElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const picked = expandIdsToCopyClosure(ids, elements)
  return cloneElementsWithNewIds(picked).map((el) => ({
    ...el,
    x: el.x + DUPLICATE_OFFSET,
    y: el.y + DUPLICATE_OFFSET,
  }))
}
