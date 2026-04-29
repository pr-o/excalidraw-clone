import type { Bounds, Point } from "./types"

export const boundsContainsPoint = (b: Bounds, p: Point): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)

export const boundsContains = (outer: Bounds, inner: Bounds): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

export const boundsFromPoints = (points: readonly Point[]): Bounds => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export const boundsCenter = (b: Bounds): Point => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
})

export const boundsExpand = (b: Bounds, padding: number): Bounds => ({
  x: b.x - padding,
  y: b.y - padding,
  width: b.width + padding * 2,
  height: b.height + padding * 2,
})
