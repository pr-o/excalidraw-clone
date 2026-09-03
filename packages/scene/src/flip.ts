import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement, PointBinding } from "./types"

export type FlipAxis = "x" | "y"

/** Per-axis mirror sign for an element; `[1, 1]` when unflipped. */
export const mirrorOf = (el: Pick<ExcalidrawElement, "mirror">): readonly [number, number] =>
  el.mirror ?? [1, 1]

/** `-0` is never a useful angle/focus value — normalize it away. */
const negate = (n: number): number => (n === 0 ? 0 : -n)

const negateFocus = (b: PointBinding | null): PointBinding | null =>
  b ? { ...b, focus: negate(b.focus) } : b

/** Reflect local-space points across the element's own bbox centre on `axis`. */
const mirrorPoints = (
  points: readonly Point[],
  axis: FlipAxis,
  width: number,
  height: number,
): Point[] =>
  points.map((p) => (axis === "x" ? { x: width - p.x, y: p.y } : { x: p.x, y: height - p.y }))

const sign = (n: number): 1 | -1 => (n === -1 ? -1 : 1)
const flipped = (n: number): 1 | -1 => (n === -1 ? 1 : -1)

/** Single-element flip: reflect across the element's own bbox centre on `axis`.
 *  x/y/width/height are preserved (a centred reflection keeps the AABB).
 *  Linear/freedraw bake the flip into `points` and never carry `mirror`;
 *  every other type toggles the `mirror` sign, omitting the key at `[1, 1]`. */
const flipOne = (el: ExcalidrawElement, axis: FlipAxis): ExcalidrawElement => {
  const angle = negate(el.angle)
  switch (el.type) {
    case "line":
    case "arrow":
      return {
        ...el,
        angle,
        points: mirrorPoints(el.points, axis, el.width, el.height),
        startBinding: negateFocus(el.startBinding),
        endBinding: negateFocus(el.endBinding),
      }
    case "freedraw":
      return { ...el, angle, points: mirrorPoints(el.points, axis, el.width, el.height) }
    default: {
      const [mx, my] = mirrorOf(el)
      const nx = axis === "x" ? flipped(mx) : sign(mx)
      const ny = axis === "y" ? flipped(my) : sign(my)
      const next = { ...el, angle }
      if (nx === 1 && ny === 1) {
        delete next.mirror
      } else {
        next.mirror = [nx, ny]
      }
      return next
    }
  }
}

/** Full replacement elements for a flip of `ids` across `axis`. Single vs.
 *  group behaviour is chosen by `ids.length`. Locked / deleted / unknown ids
 *  are dropped. Returns [] when nothing flippable is selected. */
export function flipElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  axis: FlipAxis,
): ExcalidrawElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const direct = ids
    .map((id) => byId.get(id))
    .filter((e): e is ExcalidrawElement => !!e && !e.isDeleted && !e.locked)
  if (direct.length === 0) return []

  const solo = direct[0]!
  // A lone selected frame takes the group path so its members reflect — a frame
  // rectangle is symmetric, so flipping it in isolation would be a no-op.
  if (ids.length === 1 && solo.type !== "frame") {
    return [flipOne(solo, axis)]
  }

  // group path (also taken for a lone selected frame) — implemented in Task 3
  return []
}
