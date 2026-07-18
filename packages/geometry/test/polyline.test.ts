import { describe, expect, it } from "vitest"
import { polylineMidpoint } from "../src/polyline"

describe("polylineMidpoint", () => {
  it("returns the midpoint of a straight two-point segment", () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual({ x: 5, y: 0 })
  })

  it("lands at half total length across uneven segments", () => {
    // lengths 10 then 20; half of 30 is 15 → 5 into the second segment
    const p = polylineMidpoint([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ])
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(5)
  })

  it("returns the single point for a one-point polyline", () => {
    expect(polylineMidpoint([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 })
  })

  it("returns the first point when all points coincide", () => {
    expect(
      polylineMidpoint([
        { x: 3, y: 4 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ x: 3, y: 4 })
  })

  it("returns the origin for an empty polyline", () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 })
  })
})
