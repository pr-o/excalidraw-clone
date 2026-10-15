import {
  viewportToScene,
  ZOOM_MAX,
  ZOOM_MIN,
  type Point,
  type ViewTransform,
} from "@excalidraw-clone/geometry"

type Pair = readonly [Point, Point]

const mid = ([a, b]: Pair): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = ([a, b]: Pair): number => Math.hypot(a.x - b.x, a.y - b.y)

/** View for a two-finger gesture: the scene point under the starting midpoint
 *  stays under the current midpoint, scaled by the change in finger distance.
 *  Points are canvas-relative. */
export function pinchView(start: ViewTransform, from: Pair, to: Pair): ViewTransform {
  const d0 = dist(from)
  const ratio = d0 > 0 ? dist(to) / d0 : 1
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, start.zoom * ratio))
  const anchor = viewportToScene(mid(from), start)
  const m = mid(to)
  return { zoom, scrollX: m.x / zoom - anchor.x, scrollY: m.y / zoom - anchor.y }
}
