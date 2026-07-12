import { type Bounds, boundsExpand, boundsIntersect } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, getElementBounds } from "@excalidraw-clone/scene"

/** World-space slack so stroke width and roughjs overshoot never cause a false cull. */
export const CULL_MARGIN = 16

export const isElementVisible = (
  el: ExcalidrawElement,
  view: Bounds,
  margin: number = CULL_MARGIN,
): boolean => boundsIntersect(boundsExpand(getElementBounds(el), margin), view)
