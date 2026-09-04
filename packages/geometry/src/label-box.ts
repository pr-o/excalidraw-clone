import type { Bounds } from "./types"

export type LabelShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "pentagon"
  | "octagon"

const centered = (b: Bounds, width: number, height: number): Bounds => ({
  x: b.x + (b.width - width) / 2,
  y: b.y + (b.height - height) / 2,
  width,
  height,
})

/** Largest practical axis-aligned box inside the shape, before insetting. */
const factorBox = (kind: LabelShapeKind, b: Bounds): Bounds => {
  const { x, y, width: w, height: h } = b
  switch (kind) {
    case "rectangle":
      return b
    case "ellipse":
      return centered(b, w * Math.SQRT1_2, h * Math.SQRT1_2)
    case "diamond":
      return centered(b, w / 2, h / 2)
    case "triangle":
      // largest inscribed rect of an apex-top isosceles triangle: w/2 × h/2, bottom half
      return { x: x + w / 4, y: y + h / 2, width: w / 2, height: h / 2 }
    case "parallelogram":
    case "hexagon":
      // interior for every y is at least the middle 50% of the width
      return { x: x + w / 4, y, width: w / 2, height: h }
    case "octagon":
      return { x: x + w / 3, y, width: w / 3, height: h }
    case "pentagon":
      return { x: x + w / 5, y: y + (2 * h) / 5, width: (3 * w) / 5, height: (3 * h) / 5 }
  }
}

/** Inscribed text box for a label inside a container shape: the per-shape
 *  inscribed box intersected with a `minInset` ring, clamped to ≥ 0.
 *
 *  `mirror` matches `mirroredShapeVertices`: the factor boxes above are written
 *  against the *unmirrored* outline, and several kinds are asymmetric
 *  (`triangle` sits in the bottom half, `pentagon` in the bottom band), so a
 *  mirrored container needs its box reflected across the container centre on
 *  each axis whose sign is `-1`. Reflecting the inscribed box of the unmirrored
 *  shape is exactly the inscribed box of the mirrored shape, because the
 *  reflection is the same map that produced the mirrored outline. The
 *  `minInset` ring is symmetric, so clamping commutes with the reflection. */
export const labelInnerBox = (
  kind: LabelShapeKind,
  b: Bounds,
  minInset = 8,
  mirror: readonly [number, number] = [1, 1],
): Bounds => {
  const f = factorBox(kind, b)
  const left = Math.max(f.x, b.x + minInset)
  const top = Math.max(f.y, b.y + minInset)
  const right = Math.min(f.x + f.width, b.x + b.width - minInset)
  const bottom = Math.min(f.y + f.height, b.y + b.height - minInset)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  const [mx, my] = mirror
  // reflect [left, left+width] across the centre 2*cx = 2*b.x + b.width:
  // the mirrored left edge is 2*cx - (left + width). Width/height are invariant.
  return {
    x: mx === -1 ? 2 * b.x + b.width - left - width : left,
    y: my === -1 ? 2 * b.y + b.height - top - height : top,
    width,
    height,
  }
}
