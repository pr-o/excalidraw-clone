import { boundsCenter, boundsContainsPoint } from "./bounds"
import { rotatePoint } from "./rotation"
import type { Bounds, Point } from "./types"

/** `p` in the box's own frame: the box's rotation (about its centre) undone. */
const toLocal = (p: Point, b: Bounds, angle: number): Point =>
  angle === 0 ? p : rotatePoint(p, boundsCenter(b), -angle)

/** `p` relative to the box centre, in half-widths and half-heights (the box's
 *  edges sit at ±1). Null for a box with no area. */
const unitOffset = (p: Point, b: Bounds, angle: number): Point | null => {
  if (b.width === 0 || b.height === 0) return null
  const c = boundsCenter(b)
  const local = toLocal(p, b, angle)
  return { x: (local.x - c.x) / (b.width / 2), y: (local.y - c.y) / (b.height / 2) }
}

export const pointInRectangle = (p: Point, b: Bounds, angle = 0): boolean =>
  boundsContainsPoint(b, toLocal(p, b, angle))

export const pointInEllipse = (p: Point, b: Bounds, angle = 0): boolean => {
  const u = unitOffset(p, b, angle)
  return u !== null && u.x * u.x + u.y * u.y <= 1
}

export const pointInDiamond = (p: Point, b: Bounds, angle = 0): boolean => {
  const u = unitOffset(p, b, angle)
  return u !== null && Math.abs(u.x) + Math.abs(u.y) <= 1
}
