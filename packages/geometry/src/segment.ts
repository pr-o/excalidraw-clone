import type { Point } from "./types"
import { pointDistance } from "./vector"

export const distancePointToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return pointDistance(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

export const pointOnSegment = (p: Point, a: Point, b: Point, threshold: number): boolean =>
  distancePointToSegment(p, a, b) <= threshold
