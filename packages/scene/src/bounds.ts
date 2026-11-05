import {
  type Bounds,
  type Point,
  boundsCenter,
  boundsFromPoints,
  pointAdd,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "./types"

type Corners = readonly [Point, Point, Point, Point]

/** The element's four corners (clockwise from top-left), turned by its angle
 *  about its centre — where it is actually drawn. */
export const rotatedCorners = (e: ExcalidrawElement): Corners => {
  const corners: Corners = [
    { x: e.x, y: e.y },
    { x: e.x + e.width, y: e.y },
    { x: e.x + e.width, y: e.y + e.height },
    { x: e.x, y: e.y + e.height },
  ]
  if (e.angle === 0) return corners
  const center = boundsCenter(e)
  const turn = (c: Point): Point => rotatePoint(c, center, e.angle)
  return [turn(corners[0]), turn(corners[1]), turn(corners[2]), turn(corners[3])]
}

/** Elements are immutable (edits replace the object), so bounds can be cached
 *  per object; hot paths (frame membership, alignment, hit-testing, minimap)
 *  ask for the same element's bounds on every pointer move. */
const boundsCache = new WeakMap<ExcalidrawElement, Bounds>()

export const getElementBounds = (element: ExcalidrawElement): Bounds => {
  let b = boundsCache.get(element)
  if (!b) {
    b = computeElementBounds(element)
    boundsCache.set(element, b)
  }
  return b
}

const computeElementBounds = (element: ExcalidrawElement): Bounds => {
  switch (element.type) {
    case "line":
    case "arrow":
    case "freedraw": {
      if (element.points.length === 0) return { x: element.x, y: element.y, width: 0, height: 0 }
      const absolute = element.points.map((p) => pointAdd(element, p))
      if (element.angle === 0) return boundsFromPoints(absolute)
      const center = boundsCenter(element)
      return boundsFromPoints(absolute.map((p) => rotatePoint(p, center, element.angle)))
    }
    default:
      return boundsFromPoints(rotatedCorners(element))
  }
}

export function getElementsBounds(elements: readonly ExcalidrawElement[]): Bounds | null {
  const visible = elements.filter((el) => !el.isDeleted)
  if (visible.length === 0) return null
  const corners: Point[] = []
  for (const el of visible) {
    const b = getElementBounds(el)
    corners.push({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height })
  }
  return boundsFromPoints(corners)
}
