import type { Point, ViewTransform } from "./types"

export const sceneToViewport = (p: Point, t: ViewTransform): Point => ({
  x: (p.x + t.scrollX) * t.zoom,
  y: (p.y + t.scrollY) * t.zoom,
})

export const viewportToScene = (p: Point, t: ViewTransform): Point => ({
  x: p.x / t.zoom - t.scrollX,
  y: p.y / t.zoom - t.scrollY,
})
