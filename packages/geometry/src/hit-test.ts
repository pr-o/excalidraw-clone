import type { Bounds, Point } from "./types"
import { rotatePoint } from "./rotation"
import { boundsCenter, boundsContainsPoint } from "./bounds"

const toLocal = (p: Point, b: Bounds, angle: number): Point => {
  if (angle === 0) return p
  return rotatePoint(p, boundsCenter(b), -angle)
}

export const pointInRectangle = (p: Point, b: Bounds, angle = 0): boolean =>
  boundsContainsPoint(b, toLocal(p, b, angle))

export const pointInEllipse = (p: Point, b: Bounds, angle = 0): boolean => {
  if (b.width === 0 || b.height === 0) return false
  const local = toLocal(p, b, angle)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const rx = b.width / 2
  const ry = b.height / 2
  const nx = (local.x - cx) / rx
  const ny = (local.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

export const pointInDiamond = (p: Point, b: Bounds, angle = 0): boolean => {
  if (b.width === 0 || b.height === 0) return false
  const local = toLocal(p, b, angle)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const rx = b.width / 2
  const ry = b.height / 2
  return Math.abs(local.x - cx) / rx + Math.abs(local.y - cy) / ry <= 1
}
