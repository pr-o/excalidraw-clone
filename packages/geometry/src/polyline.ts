import type { Point } from "./types"
import { pointDistance } from "./vector"

/** Point at half the polyline's cumulative length, in the polyline's own
 *  coordinate space. Degenerate inputs fall back to the first point
 *  (or the origin for an empty polyline). */
export const polylineMidpoint = (points: readonly Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    total += pointDistance(points[i]!, points[i + 1]!)
  }
  if (total === 0) return points[0]!
  let remaining = total / 2
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = pointDistance(a, b)
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
    }
    remaining -= len
  }
  return points[points.length - 1]!
}
