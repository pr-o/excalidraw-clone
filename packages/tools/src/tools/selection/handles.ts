import {
  boundsCorners,
  midpoint,
  pointAdd,
  pointDistance,
  resizeHandles,
  rotationHandlePoint,
  sceneToViewport,
  type Point,
  type ResizeHandle,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  borderAtLocal,
  getElementsBounds,
  isLinearElement,
  rotatedCorners,
  toTableLocal,
} from "@excalidraw-clone/scene"
import type { LinearEnd } from "./types"

const HANDLE_HIT_HALF = 6
const ROTATION_HANDLE_HIT_RADIUS = 8
/** Screen px within which a table column/row border is grabbable. */
const TABLE_BORDER_HIT = 4

export type HandleHit =
  | { kind: "resize"; elementId: string; handle: ResizeHandle }
  | { kind: "rotate"; elementId: string }
  | { kind: "endpoint"; elementId: string; end: LinearEnd }
  | { kind: "bend"; elementId: string; index: number }
  | { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }
  | { kind: "groupResize"; handle: ResizeHandle; ids: readonly string[] }
  | { kind: "tableBorder"; elementId: string; axis: "col" | "row"; index: number }

const within = (p: Point, target: Point, half = HANDLE_HIT_HALF): boolean =>
  Math.abs(p.x - target.x) <= half && Math.abs(p.y - target.y) <= half

type Quad = [Point, Point, Point, Point]

export const findHandleAt = (
  at: Point,
  selectedIds: readonly string[],
  elements: readonly ExcalidrawElement[],
  view: ViewTransform,
): HandleHit | null => {
  if (selectedIds.length >= 2) {
    const selected = selectedIds
      .map((id) => elements.find((el) => el.id === id))
      .filter((el): el is ExcalidrawElement => !!el && !el.isDeleted)
    if (selected.length < 2) return null
    const bounds = getElementsBounds(selected)
    if (!bounds) return null
    const atV = sceneToViewport(at, view)
    const corners = boundsCorners(bounds).map((c) => sceneToViewport(c, view)) as Quad
    const hit = resizeHandles(corners).find((h) => within(atV, h.at))
    return hit ? { kind: "groupResize", handle: hit.name, ids: selectedIds } : null
  }
  if (selectedIds.length !== 1) return null
  const id = selectedIds[0]!
  const e = elements.find((el) => el.id === id)
  if (!e) return null

  const atV = sceneToViewport(at, view)
  if (isLinearElement(e)) {
    const abs = e.points.map((p) => pointAdd(e, p))
    // Endpoints first.
    if (within(atV, sceneToViewport(abs[0]!, view))) {
      return { kind: "endpoint", elementId: id, end: "start" }
    }
    if (within(atV, sceneToViewport(abs[abs.length - 1]!, view))) {
      return { kind: "endpoint", elementId: id, end: "end" }
    }
    const elbowed = e.type === "arrow" && e.elbowed
    if (!elbowed) {
      // Interior bend points.
      for (let k = 1; k < abs.length - 1; k += 1) {
        if (within(atV, sceneToViewport(abs[k]!, view))) {
          return { kind: "bend", elementId: id, index: k }
        }
      }
      // Segment midpoints (add a bend).
      for (let k = 0; k < abs.length - 1; k += 1) {
        const mid = midpoint(abs[k]!, abs[k + 1]!)
        if (within(atV, sceneToViewport(mid, view))) {
          return { kind: "bendAdd", elementId: id, segmentIndex: k, at: mid }
        }
      }
    }
    return null
  }

  const corners = rotatedCorners(e).map((c) => sceneToViewport(c, view)) as Quad
  // The rotation handle first: it sits just outside the box.
  if (
    pointDistance(atV, rotationHandlePoint(corners[0], corners[1])) <= ROTATION_HANDLE_HIT_RADIUS
  ) {
    return { kind: "rotate", elementId: id }
  }
  const resize = resizeHandles(corners).find((h) => within(atV, h.at))
  if (resize) return { kind: "resize", elementId: id, handle: resize.name }
  if (e.type === "table") {
    const border = borderAtLocal(e, toTableLocal(e, at), TABLE_BORDER_HIT / view.zoom)
    if (border) return { kind: "tableBorder", elementId: id, ...border }
  }
  return null
}
