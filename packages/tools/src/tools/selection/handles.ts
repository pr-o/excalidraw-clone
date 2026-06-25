import {
  type Point,
  type ViewTransform,
  rotatePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ResizeHandle } from "./types"

const HANDLE_HIT_HALF = 6
const ROTATION_HANDLE_OFFSET = 20
const ROTATION_HANDLE_HIT_RADIUS = 8

export type HandleHit =
  | { kind: "resize"; elementId: string; handle: ResizeHandle }
  | { kind: "rotate"; elementId: string }
  | { kind: "endpoint"; elementId: string; end: "start" | "end" }
  | { kind: "bend"; elementId: string; index: number }
  | { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }

const rotatedCorners = (e: ExcalidrawElement): readonly [Point, Point, Point, Point] => {
  const corners: [Point, Point, Point, Point] = [
    { x: e.x, y: e.y },
    { x: e.x + e.width, y: e.y },
    { x: e.x + e.width, y: e.y + e.height },
    { x: e.x, y: e.y + e.height },
  ]
  if (e.angle === 0) return corners
  const center: Point = { x: e.x + e.width / 2, y: e.y + e.height / 2 }
  return [
    rotatePoint(corners[0], center, e.angle),
    rotatePoint(corners[1], center, e.angle),
    rotatePoint(corners[2], center, e.angle),
    rotatePoint(corners[3], center, e.angle),
  ]
}

const midPoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

const within = (p: Point, target: Point, half = HANDLE_HIT_HALF): boolean =>
  Math.abs(p.x - target.x) <= half && Math.abs(p.y - target.y) <= half

const isLinear = (e: ExcalidrawElement): boolean => e.type === "arrow" || e.type === "line"

export const findHandleAt = (
  at: Point,
  selectedIds: readonly string[],
  elements: readonly ExcalidrawElement[],
  view: ViewTransform,
): HandleHit | null => {
  if (selectedIds.length !== 1) return null
  const id = selectedIds[0]!
  const e = elements.find((el) => el.id === id)
  if (!e) return null

  if (isLinear(e)) {
    const atV = sceneToViewport(at, view)
    const pts = (e as { points: readonly Point[] }).points
    const abs = pts.map((p) => ({ x: e.x + p.x, y: e.y + p.y }))
    // Endpoints first.
    if (within(atV, sceneToViewport(abs[0]!, view))) {
      return { kind: "endpoint", elementId: id, end: "start" }
    }
    if (within(atV, sceneToViewport(abs[abs.length - 1]!, view))) {
      return { kind: "endpoint", elementId: id, end: "end" }
    }
    // Interior bend points.
    for (let k = 1; k < abs.length - 1; k += 1) {
      if (within(atV, sceneToViewport(abs[k]!, view))) {
        return { kind: "bend", elementId: id, index: k }
      }
    }
    // Segment midpoints (add a bend).
    for (let k = 0; k < abs.length - 1; k += 1) {
      const mid = midPoint(abs[k]!, abs[k + 1]!)
      if (within(atV, sceneToViewport(mid, view))) {
        return { kind: "bendAdd", elementId: id, segmentIndex: k, at: mid }
      }
    }
    return null
  }

  const atV = sceneToViewport(at, view)
  const cornersScene = rotatedCorners(e)
  const corners = cornersScene.map((c) => sceneToViewport(c, view))
  const [nw, ne, se, sw] = corners as [Point, Point, Point, Point]

  // Rotation handle first (above top-edge midpoint).
  const topMid = midPoint(nw, ne)
  const dx = ne.x - nw.x
  const dy = ne.y - nw.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const rotPoint: Point = {
    x: topMid.x + nx * -ROTATION_HANDLE_OFFSET,
    y: topMid.y + ny * -ROTATION_HANDLE_OFFSET,
  }
  if (Math.hypot(atV.x - rotPoint.x, atV.y - rotPoint.y) <= ROTATION_HANDLE_HIT_RADIUS) {
    return { kind: "rotate", elementId: id }
  }

  const handlePoints: { name: ResizeHandle; p: Point }[] = [
    { name: "nw", p: nw },
    { name: "ne", p: ne },
    { name: "se", p: se },
    { name: "sw", p: sw },
    { name: "n", p: midPoint(nw, ne) },
    { name: "e", p: midPoint(ne, se) },
    { name: "s", p: midPoint(se, sw) },
    { name: "w", p: midPoint(sw, nw) },
  ]
  for (const { name, p } of handlePoints) {
    if (within(atV, p)) return { kind: "resize", elementId: id, handle: name }
  }
  return null
}
