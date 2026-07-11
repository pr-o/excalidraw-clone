import {
  type Bounds,
  boundsExpand,
  boundsFromPoints,
  boundsIntersect,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** World-space slack so stroke width and roughjs overshoot never cause a false cull. */
export const CULL_MARGIN = 16

const elementAABB = (el: ExcalidrawElement): Bounds => {
  // Point bounds cover linear elements whose points may exceed the x/y/w/h box.
  const local: Bounds =
    "points" in el && el.points.length > 0
      ? boundsFromPoints(el.points)
      : { x: 0, y: 0, width: el.width, height: el.height }
  if (el.angle === 0) {
    return { x: el.x + local.x, y: el.y + local.y, width: local.width, height: local.height }
  }
  const cx = el.width / 2
  const cy = el.height / 2
  const cos = Math.cos(el.angle)
  const sin = Math.sin(el.angle)
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x, y: local.y + local.height },
    { x: local.x + local.width, y: local.y + local.height },
  ].map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: el.x + cx + dx * cos - dy * sin, y: el.y + cy + dx * sin + dy * cos }
  })
  return boundsFromPoints(corners)
}

export const isElementVisible = (
  el: ExcalidrawElement,
  view: Bounds,
  margin: number = CULL_MARGIN,
): boolean => boundsIntersect(boundsExpand(elementAABB(el), margin), view)
