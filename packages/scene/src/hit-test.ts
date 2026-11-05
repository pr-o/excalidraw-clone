import {
  type Point,
  boundsCenter,
  distancePointToSegment,
  mirroredShapeVertices,
  pointInConvexPolygon,
  pointInDiamond,
  pointInEllipse,
  pointInRectangle,
  pointAdd,
  pointDistance,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import { mirrorOf } from "./flip"
import type { ExcalidrawElement } from "./types"

export interface HitTestOptions {
  threshold?: number
}

const defaultLinearThreshold = (e: ExcalidrawElement): number => Math.max(e.strokeWidth * 2, 5)

const toElementLocal = (p: Point, e: ExcalidrawElement): Point =>
  e.angle === 0 ? p : rotatePoint(p, boundsCenter(e), -e.angle)

const polylineHit = (
  e: ExcalidrawElement,
  p: Point,
  points: readonly Point[],
  threshold: number,
): boolean => {
  if (points.length === 0) return false
  const local = toElementLocal(p, e)
  const at = (i: number): Point => pointAdd(e, points[i]!)
  if (points.length === 1) return pointDistance(local, at(0)) <= threshold
  for (let i = 0; i < points.length - 1; i += 1) {
    if (distancePointToSegment(local, at(i), at(i + 1)) <= threshold) return true
  }
  return false
}

/** Whether a scene `point` lands on the element as drawn: inside a closed shape (its
 *  rotation undone), or within `threshold` of a line's path. */
export const hitTestElement = (
  element: ExcalidrawElement,
  point: Point,
  options?: HitTestOptions,
): boolean => {
  if (element.isDeleted) return false
  switch (element.type) {
    case "rectangle":
    case "text":
    case "image":
    case "frame":
    case "table":
      return pointInRectangle(point, element, element.angle)
    case "ellipse":
      return pointInEllipse(point, element, element.angle)
    case "triangle":
    case "parallelogram":
    case "hexagon":
    case "pentagon":
    case "octagon":
      return pointInConvexPolygon(
        point,
        mirroredShapeVertices(element.type, element, mirrorOf(element)),
        boundsCenter(element),
        element.angle,
      )
    case "diamond":
      return pointInDiamond(point, element, element.angle)
    case "line":
    case "arrow":
    case "freedraw": {
      const threshold = options?.threshold ?? defaultLinearThreshold(element)
      return polylineHit(element, point, element.points, threshold)
    }
  }
}
