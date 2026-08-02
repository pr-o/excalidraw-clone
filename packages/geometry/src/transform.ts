import { clamp } from "./scalar"
import type { Bounds, Point, ViewTransform } from "./types"

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

const FIT_PADDING = 1.1

export const fitToContent = (
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
): ViewTransform => {
  const width = Math.max(bounds.width, 1)
  const height = Math.max(bounds.height, 1)
  const zoom = clamp(
    Math.min(viewportWidth / (width * FIT_PADDING), viewportHeight / (height * FIT_PADDING)),
    ZOOM_MIN,
    ZOOM_MAX,
  )
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return {
    zoom,
    scrollX: viewportWidth / 2 / zoom - centerX,
    scrollY: viewportHeight / 2 / zoom - centerY,
  }
}
