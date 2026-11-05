import type { Point } from "./types"
import { midpoint } from "./vector"

/** A selection box's resize handles: corners and edge midpoints, by compass point. */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

/** Screen px from the middle of the top edge out to the rotation handle. */
export const ROTATION_HANDLE_OFFSET = 20

/** The eight resize handles of a quad from its corners (clockwise from the top-left),
 *  corners first. The one definition both the drawn handles and their hit-testing use. */
export const resizeHandles = ([nw, ne, se, sw]: readonly [Point, Point, Point, Point]): {
  name: ResizeHandle
  at: Point
}[] => [
  { name: "nw", at: nw },
  { name: "ne", at: ne },
  { name: "se", at: se },
  { name: "sw", at: sw },
  { name: "n", at: midpoint(nw, ne) },
  { name: "e", at: midpoint(ne, se) },
  { name: "s", at: midpoint(se, sw) },
  { name: "w", at: midpoint(sw, nw) },
]

/** The rotation handle: `offset` out from the middle of the top edge (`nw` → `ne`),
 *  perpendicular to it, so it follows the box as it turns. */
export const rotationHandlePoint = (
  nw: Point,
  ne: Point,
  offset = ROTATION_HANDLE_OFFSET,
): Point => {
  const top = midpoint(nw, ne)
  const dx = ne.x - nw.x
  const dy = ne.y - nw.y
  const len = Math.hypot(dx, dy) || 1
  return { x: top.x + (dy / len) * offset, y: top.y - (dx / len) * offset }
}
