import {
  type Bounds,
  type Point,
  distancePointToSegment,
  pointInDiamond,
  pointInEllipse,
  pointInRectangle,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "./types"

export interface HitTestOptions {
  threshold?: number
}

const elementBoundsUnrotated = (e: ExcalidrawElement): Bounds => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
})

const defaultLinearThreshold = (e: ExcalidrawElement): number => Math.max(e.strokeWidth * 2, 5)

const toElementLocal = (p: Point, e: ExcalidrawElement): Point => {
  if (e.angle === 0) return p
  const center: Point = { x: e.x + e.width / 2, y: e.y + e.height / 2 }
  return rotatePoint(p, center, -e.angle)
}

const polylineHit = (
  e: ExcalidrawElement,
  p: Point,
  points: readonly Point[],
  threshold: number,
): boolean => {
  if (points.length === 0) return false
  const local = toElementLocal(p, e)
  const origin: Point = { x: e.x, y: e.y }
  if (points.length === 1) {
    const a = points[0]!
    const ax = origin.x + a.x
    const ay = origin.y + a.y
    return Math.hypot(local.x - ax, local.y - ay) <= threshold
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const ax = { x: origin.x + a.x, y: origin.y + a.y }
    const bx = { x: origin.x + b.x, y: origin.y + b.y }
    if (distancePointToSegment(local, ax, bx) <= threshold) return true
  }
  return false
}

export const hitTestElement = (
  element: ExcalidrawElement,
  point: Point,
  options?: HitTestOptions,
): boolean => {
  if (element.isDeleted) return false
  const b = elementBoundsUnrotated(element)
  switch (element.type) {
    case "rectangle":
    case "text":
    case "image":
    case "frame":
      return pointInRectangle(point, b, element.angle)
    case "ellipse":
      return pointInEllipse(point, b, element.angle)
    // Temporary bbox approximation — replaced with exact polygon hit-testing
    // in the flowchart-shapes Task 3.
    case "triangle":
    case "parallelogram":
    case "hexagon":
      return pointInRectangle(point, b, element.angle)
    case "diamond":
      return pointInDiamond(point, b, element.angle)
    case "line":
    case "arrow":
    case "freedraw": {
      const threshold = options?.threshold ?? defaultLinearThreshold(element)
      return polylineHit(element, point, element.points, threshold)
    }
  }
}
