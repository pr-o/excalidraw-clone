import { boundsCenter } from "./bounds"
import { rotatePoint } from "./rotation"
import type { Bounds, Point } from "./types"

export type PolygonShapeKind = "triangle" | "parallelogram" | "hexagon" | "pentagon" | "octagon"

/** Absolute vertices for a fixed-proportion flowchart shape inside `b`. */
export const shapeVertices = (kind: PolygonShapeKind, b: Bounds): Point[] => {
  const { x, y, width: w, height: h } = b
  switch (kind) {
    case "triangle":
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ]
    case "parallelogram":
      return [
        { x: x + w / 4, y },
        { x: x + w, y },
        { x: x + (3 * w) / 4, y: y + h },
        { x, y: y + h },
      ]
    case "hexagon":
      return [
        { x: x + w / 4, y },
        { x: x + (3 * w) / 4, y },
        { x: x + w, y: y + h / 2 },
        { x: x + (3 * w) / 4, y: y + h },
        { x: x + w / 4, y: y + h },
        { x, y: y + h / 2 },
      ]
    case "pentagon":
      // apex top-center; shoulders at 2/5 height; base inset 1/5 from each side
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + (2 * h) / 5 },
        { x: x + (4 * w) / 5, y: y + h },
        { x: x + w / 5, y: y + h },
        { x, y: y + (2 * h) / 5 },
      ]
    case "octagon":
      // flat top/right/bottom/left edges, corners cut by 1/3
      return [
        { x: x + w / 3, y },
        { x: x + (2 * w) / 3, y },
        { x: x + w, y: y + h / 3 },
        { x: x + w, y: y + (2 * h) / 3 },
        { x: x + (2 * w) / 3, y: y + h },
        { x: x + w / 3, y: y + h },
        { x, y: y + (2 * h) / 3 },
        { x, y: y + h / 3 },
      ]
  }
}

/** Point-in-convex-polygon via same-side half-plane tests. `angle` rotates
 *  the polygon around `center`; the point is un-rotated instead. */
export const pointInConvexPolygon = (
  p: Point,
  vertices: readonly Point[],
  center: Point,
  angle = 0,
): boolean => {
  if (vertices.length < 3) return false
  const local = angle === 0 ? p : rotatePoint(p, center, -angle)
  let sign = 0
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    const cross = (b.x - a.x) * (local.y - a.y) - (b.y - a.y) * (local.x - a.x)
    if (cross === 0) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Intersection of the ray (bounds center → toward) with the polygon
 *  boundary — the polygon analogue of `edgePointToward`. Falls back to the
 *  center for degenerate directions. */
export const polygonEdgePointToward = (
  vertices: readonly Point[],
  bounds: Bounds,
  toward: Point,
): Point => {
  const c = boundsCenter(bounds)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  let best: Point | null = null
  let bestT = Infinity
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = dx * ey - dy * ex
    if (denom === 0) continue
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / denom
    const u = ex !== 0 ? (c.x + t * dx - a.x) / ex : (c.y + t * dy - a.y) / ey
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) {
      bestT = t
      best = { x: c.x + t * dx, y: c.y + t * dy }
    }
  }
  return best ?? c
}
