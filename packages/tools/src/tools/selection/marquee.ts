import { type Bounds, boundsContains, boundsFromPoints } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, getElementBounds } from "@excalidraw-clone/scene"

export const marqueeBounds = (a: { x: number; y: number }, b: { x: number; y: number }): Bounds =>
  boundsFromPoints([a, b])

export const elementsInsideMarquee = (
  marquee: Bounds,
  elements: readonly ExcalidrawElement[],
): readonly string[] => {
  const ids: string[] = []
  for (const e of elements) {
    if (e.isDeleted) continue
    if (e.locked) continue
    const b = getElementBounds(e)
    if (boundsContains(marquee, b)) ids.push(e.id)
  }
  return ids
}
