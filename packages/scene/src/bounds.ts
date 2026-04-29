import {
  type Bounds,
  type Point,
  boundsFromPoints,
  pointAdd,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "./types"

const cornersOf = (e: ExcalidrawElement): readonly Point[] => [
  { x: e.x, y: e.y },
  { x: e.x + e.width, y: e.y },
  { x: e.x + e.width, y: e.y + e.height },
  { x: e.x, y: e.y + e.height },
]

const rotatedCorners = (e: ExcalidrawElement): readonly Point[] => {
  if (e.angle === 0) return cornersOf(e)
  const center: Point = { x: e.x + e.width / 2, y: e.y + e.height / 2 }
  return cornersOf(e).map((c) => rotatePoint(c, center, e.angle))
}

export const getElementBounds = (element: ExcalidrawElement): Bounds => {
  switch (element.type) {
    case "line":
    case "arrow":
    case "freedraw": {
      const origin: Point = { x: element.x, y: element.y }
      if (element.points.length === 0) {
        return { x: origin.x, y: origin.y, width: 0, height: 0 }
      }
      const absolute = element.points.map((p) => pointAdd(origin, p))
      if (element.angle === 0) return boundsFromPoints(absolute)
      const center: Point = pointAdd(origin, {
        x: element.width / 2,
        y: element.height / 2,
      })
      return boundsFromPoints(absolute.map((p) => rotatePoint(p, center, element.angle)))
    }
    default:
      return boundsFromPoints(rotatedCorners(element))
  }
}
