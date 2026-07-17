import type { Bounds } from "./types"

export type LabelShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"

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
  }
}

/** Inscribed text box for a label inside a container shape: the per-shape
 *  inscribed box intersected with a `minInset` ring, clamped to ≥ 0. */
export const labelInnerBox = (kind: LabelShapeKind, b: Bounds, minInset = 8): Bounds => {
  const f = factorBox(kind, b)
  const left = Math.max(f.x, b.x + minInset)
  const top = Math.max(f.y, b.y + minInset)
  const right = Math.min(f.x + f.width, b.x + b.width - minInset)
  const bottom = Math.min(f.y + f.height, b.y + b.height - minInset)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}
