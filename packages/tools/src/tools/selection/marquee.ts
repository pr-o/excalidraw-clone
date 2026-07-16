import { type Bounds, boundsContains } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, getElementBounds } from "@excalidraw-clone/scene"

export const marqueeBounds = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
})

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
