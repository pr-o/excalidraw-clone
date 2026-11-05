import { describe, expect, it } from "vitest"
import { ROTATION_HANDLE_OFFSET, resizeHandles, rotationHandlePoint } from "../src/handles"

const box = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
] as const

describe("selection handles", () => {
  it("puts the corner handles first, then the edge midpoints", () => {
    expect(resizeHandles(box).map((h) => [h.name, h.at.x, h.at.y])).toEqual([
      ["nw", 0, 0],
      ["ne", 100, 0],
      ["se", 100, 50],
      ["sw", 0, 50],
      ["n", 50, 0],
      ["e", 100, 25],
      ["s", 50, 50],
      ["w", 0, 25],
    ])
  })

  it("places the rotation handle above the top edge, turning with the box", () => {
    expect(rotationHandlePoint(box[0], box[1])).toEqual({ x: 50, y: -ROTATION_HANDLE_OFFSET })
    // Turned 90° clockwise, the top edge runs downward on the right: the handle sits right of it.
    const p = rotationHandlePoint({ x: 0, y: 0 }, { x: 0, y: 100 })
    expect(p.x).toBeCloseTo(ROTATION_HANDLE_OFFSET)
    expect(p.y).toBeCloseTo(50)
  })
})
