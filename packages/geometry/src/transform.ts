import type { Point, ViewTransform } from "./types"

export const sceneToViewport = (p: Point, t: ViewTransform): Point => ({
  x: (p.x + t.scrollX) * t.zoom,
  y: (p.y + t.scrollY) * t.zoom,
})

export const viewportToScene = (p: Point, t: ViewTransform): Point => ({
  x: p.x / t.zoom - t.scrollX,
  y: p.y / t.zoom - t.scrollY,
})

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5

export const zoomToPoint = (
  view: ViewTransform,
  anchor: Point,
  targetZoom: number,
): ViewTransform => {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom))
  const scenePoint = viewportToScene(anchor, view)
  return {
    zoom,
    scrollX: anchor.x / zoom - scenePoint.x,
    scrollY: anchor.y / zoom - scenePoint.y,
  }
}
