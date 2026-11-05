import { boundsCenter } from "./bounds"
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

/** The scene-space rectangle a `vw` x `vh` viewport currently shows. */
export const viewportSceneRect = (v: ViewTransform, vw: number, vh: number): Bounds => ({
  x: -v.scrollX,
  y: -v.scrollY,
  width: vw / v.zoom,
  height: vh / v.zoom,
})

/** Same zoom, scrolled so `scenePoint` sits at the viewport centre. */
export const centerViewOn = (
  scenePoint: Point,
  v: ViewTransform,
  vw: number,
  vh: number,
): ViewTransform => ({
  zoom: v.zoom,
  scrollX: vw / 2 / v.zoom - scenePoint.x,
  scrollY: vh / 2 / v.zoom - scenePoint.y,
})

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5

/** Zooms to `targetZoom` (clamped) keeping the scene point under `anchor` in place. */
export const zoomToPoint = (
  view: ViewTransform,
  anchor: Point,
  targetZoom: number,
): ViewTransform => {
  const zoom = clamp(targetZoom, ZOOM_MIN, ZOOM_MAX)
  const scenePoint = viewportToScene(anchor, view)
  return {
    zoom,
    scrollX: anchor.x / zoom - scenePoint.x,
    scrollY: anchor.y / zoom - scenePoint.y,
  }
}

const FIT_PADDING = 1.1

/** The view that shows `bounds` whole and centred, with a 10% margin. */
export const fitToContent = (
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  maxZoom = ZOOM_MAX,
): ViewTransform => {
  const width = Math.max(bounds.width, 1)
  const height = Math.max(bounds.height, 1)
  const zoom = clamp(
    Math.min(viewportWidth / (width * FIT_PADDING), viewportHeight / (height * FIT_PADDING)),
    ZOOM_MIN,
    maxZoom,
  )
  return centerViewOn(
    boundsCenter(bounds),
    { zoom, scrollX: 0, scrollY: 0 },
    viewportWidth,
    viewportHeight,
  )
}
