import { boundsFromPoints, type Bounds, type Point } from "@excalidraw-clone/geometry"
import { fitTableBox, type ResizeAnchor } from "./table"
import type { ExcalidrawElement } from "./types"
import { isPassengerLabel } from "./bound-label"
import { editableElements } from "./editable"

/** A font under this size is unreadable rather than merely small. */
const MIN_FONT_SIZE = 4

const scalePoint = (p: Point, sx: number, sy: number): Point => ({ x: p.x * sx, y: p.y * sy })

/** Full replacement elements for scaling the closure of `ids` from
 *  `originBounds` to `newBounds`. Position scales relative to
 *  `originBounds`'s top-left for every element type; size then scales
 *  per-type (rectangle-like incl. frame/image: width/height * scale;
 *  line/arrow/freedraw: points scaled componentwise, width/height
 *  recomputed from the scaled points' bbox rather than multiplied; text:
 *  fontSize scales by the y-axis factor, clamped to a minimum of 4).
 *  `angle` is untouched for every type, and both boxes are axis-aligned (the
 *  group box has no rotate handle; rotated members are not sheared). A table clamped bigger than its
 *  scaled box (minimum track sizes, auto-grown rows) grows away from the
 *  `anchor` sides — the group's fixed edges. Locked, deleted, unknown ids, and
 *  passenger bound-text labels are dropped from the result, mirroring
 *  `flipElements`. Returns [] when nothing resizable is selected. */
export function resizeElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  originBounds: Bounds,
  newBounds: Bounds,
  anchor: ResizeAnchor = { x: "start", y: "start" },
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  const direct = editableElements(elements, ids)
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
        case "table":
          return fitTableBox(el, { x, y, width: el.width * sx, height: el.height * sy }, anchor)
        default:
          return { ...el, x, y, width: el.width * sx, height: el.height * sy }
      }
    })
}
