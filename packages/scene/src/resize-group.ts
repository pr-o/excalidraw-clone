import { boundsFromPoints, type Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "./types"

/** Plain x/y/width/height box — the shape both the pre-drag combined
 *  selection bounds and the post-drag target bounds take. No `angle`: a
 *  group-resize box is always axis-aligned (no rotate handle for the group
 *  box, no affine shear for rotated members). */
export interface ResizeBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A font under this size is unreadable rather than merely small. */
const MIN_FONT_SIZE = 4

/** A bound-text label pulled into the set only because its container is
 *  also selected — excluded from direct transform; `reconcileBoundText`
 *  (already invoked unconditionally inside `Scene.mutate`) re-lays it out
 *  against its container's new box afterward. Mirrors `isPassengerLabel`
 *  in `flip.ts`. */
const isPassengerLabel = (el: ExcalidrawElement, inSet: ReadonlySet<string>): boolean =>
  el.type === "text" && el.containerId !== null && inSet.has(el.containerId)

const scalePoint = (p: Point, sx: number, sy: number): Point => ({ x: p.x * sx, y: p.y * sy })

/** Full replacement elements for scaling the closure of `ids` from
 *  `originBounds` to `newBounds`. Position scales relative to
 *  `originBounds`'s top-left for every element type; size then scales
 *  per-type (rectangle-like incl. frame/image: width/height * scale;
 *  line/arrow/freedraw: points scaled componentwise, width/height
 *  recomputed from the scaled points' bbox rather than multiplied; text:
 *  fontSize scales by the y-axis factor, clamped to a minimum of 4).
 *  `angle` is untouched for every type. Locked, deleted, unknown ids, and
 *  passenger bound-text labels are dropped from the result, mirroring
 *  `flipElements`. Returns [] when nothing resizable is selected. */
export function resizeElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  originBounds: ResizeBounds,
  newBounds: ResizeBounds,
): ExcalidrawElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const idSet = new Set(ids)
  const direct = ids
    .map((id) => byId.get(id))
    .filter((e): e is ExcalidrawElement => !!e && !e.isDeleted && !e.locked)
  if (direct.length === 0) return []

  // A zero-extent origin axis (a perfectly flat line, a single-point
  // freedraw stroke, or any other zero-width/zero-height member standing
  // in for the whole selection) would divide by zero; force that axis's
  // scale to 1 instead of propagating Infinity/NaN into every scaled field.
  const sx = originBounds.width === 0 ? 1 : newBounds.width / originBounds.width
  const sy = originBounds.height === 0 ? 1 : newBounds.height / originBounds.height

  return direct
    .filter((el) => !isPassengerLabel(el, idSet))
    .map((el) => {
      const x = newBounds.x + (el.x - originBounds.x) * sx
      const y = newBounds.y + (el.y - originBounds.y) * sy

      switch (el.type) {
        case "line":
        case "arrow":
        case "freedraw": {
          const points = el.points.map((p) => scalePoint(p, sx, sy))
          const bbox = boundsFromPoints(points)
          return { ...el, x, y, points, width: bbox.width, height: bbox.height }
        }
        case "text": {
          const fontSize = Math.max(MIN_FONT_SIZE, el.fontSize * sy)
          return { ...el, x, y, width: el.width * sx, height: el.height * sy, fontSize }
        }
        default:
          return { ...el, x, y, width: el.width * sx, height: el.height * sy }
      }
    })
}
