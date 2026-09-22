import { describe, expect, it } from "vitest"
import { computeAlignmentSnap } from "../src/alignment-guides"

describe("computeAlignmentSnap", () => {
  it("snaps a far edge to another element's near edge within threshold (edge-to-edge, x axis)", () => {
    const moving = { x: 92, y: 0, width: 50, height: 50 } // far edge = 142
    // Thin on y (12..13) so no y value lands within the threshold of the moving
    // box's 0/25/50, isolating this test to the x axis, while still sitting
    // inside 0..50 so the x guide spans the union of both y extents.
    const candidate = { x: 150, y: 12, width: 50, height: 1 } // near edge = 150
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dx).toBe(8) // 150 - 142
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([{ axis: "x", position: 150, start: 0, end: 50 }])
  })

  it("snaps center to center on the y axis", () => {
    const moving = { x: 0, y: 96, width: 20, height: 20 } // center y = 106
    const candidate = { x: 200, y: 90, width: 20, height: 40 } // center y = 110
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dy).toBe(4) // 110 - 106
    expect(result.dx).toBe(0)
    expect(result.guides).toEqual([{ axis: "y", position: 110, start: 0, end: 220 }])
  })

  it("snaps independently on both axes against different candidates", () => {
    const moving = { x: 100, y: 100, width: 10, height: 10 } // far edges = 110
    const candX = { x: 118, y: 900, width: 10, height: 10 } // near x = 118 (y is far away)
    const candY = { x: 900, y: 118, width: 10, height: 10 } // near y = 118 (x is far away)
    const result = computeAlignmentSnap(moving, [candX, candY], 10)
    expect(result.dx).toBe(8) // 118 - 110
    expect(result.dy).toBe(8) // 118 - 110
    expect(result.guides.length).toBe(2)
  })

  it("does not snap when the nearest value is exactly outside the threshold", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // far edge = 10
    const candidate = { x: 20.01, y: 1000, width: 10, height: 10 } // near edge dist = 10.01
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it("snaps when the nearest value is exactly at the threshold boundary", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // far edge = 10
    const candidate = { x: 20, y: 1000, width: 10, height: 10 } // near edge dist = 10
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dx).toBe(10)
    expect(result.guides).toHaveLength(1)
  })

  it("picks the closest match across multiple candidates on the same axis", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // values (0, 5, 10)
    const far = { x: 25, y: 1000, width: 10, height: 10 } // nearest diff = 15
    const near = { x: 18, y: 1000, width: 10, height: 10 } // nearest diff = 8
    const result = computeAlignmentSnap(moving, [far, near], 20)
    expect(result.dx).toBe(8) // 18 - 10, from `near`, not `far`
  })

  it("returns zero correction and no guides when nothing is within threshold on either axis", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 }
    const candidate = { x: 1000, y: 1000, width: 10, height: 10 }
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it("returns zero correction and no guides with no candidates at all", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 }
    const result = computeAlignmentSnap(moving, [], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})
